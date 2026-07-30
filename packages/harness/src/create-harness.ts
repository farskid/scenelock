import {
  bboxCenter,
  type ExecutionTier,
  type FailureEnvelope,
  type Locator,
  type PointerOptions,
  type RasterFrame,
  type SceneAdapter,
  type SceneNode,
  type ScenePredicate,
  type SeededRandom,
  type StepLoopDriver,
  type StepUntilOptions,
  type VirtualClock,
} from "@scenelock/core";
import {
  AutoWaitTimeoutError,
  StructuralLocatorDeniedError,
  assertLocatorAllowed,
  translateLocator,
  type PageDriver,
} from "@scenelock/browser";
import {
  ExecutorFailure,
  StepStarvationError,
  buildFailureEnvelope,
  createExecutor,
  createVirtualClock,
  DEFAULT_STEP_UNTIL_MAX_STEPS,
} from "@scenelock/executor";
import {
  awaitSettled,
  createSceneQuery,
  type SceneQueryEngine,
  type GetByRoleOptions,
} from "@scenelock/scene";
import { createRealClockShim } from "./clock-shim.js";
import { harnessPoll } from "./poll.js";
import { assertTierCapability, TierPromotionError, TIER_CAPABILITIES } from "./tiers.js";
import {
  HarnessFailure,
  type CreateHarnessOptions,
  type Expectation,
  type ExpectSurface,
  type GoldenSurface,
  type HarnessGoldenStore,
  type PointerSink,
  type SceneHandle,
  type SceneSurface,
  type TargetHandle,
  type TestHarness,
  type UiHandle,
  type UiSurface,
  type UserSurface,
} from "./types.js";

interface HarnessState {
  readonly tier: ExecutionTier;
  readonly seed: string;
  readonly rng: SeededRandom;
  readonly clock: VirtualClock;
  readonly timeoutMs: number;
  readonly testId: string;
  readonly file: string;
  readonly title: string;
  adapter: SceneAdapter | undefined;
  driver: PageDriver | undefined;
  pointer: PointerSink | undefined;
  stepLoop: StepLoopDriver | undefined;
  goldenStore: HarnessGoldenStore | undefined;
  query: SceneQueryEngine | undefined;
  /** When true, sync queries + snapshot reuse the pinned query until refresh(). */
  sceneFrozen: boolean;
  disposed: boolean;
  /** Realm clock install for deterministic tiers. */
  clockInstalled: boolean;
}

function matchText(actual: string, expected: string | RegExp): boolean {
  return typeof expected === "string" ? actual.includes(expected) : expected.test(actual);
}

function matchScenePredicate(node: SceneNode, predicate: ScenePredicate): boolean {
  if (typeof predicate === "function") return predicate(node);
  if ("id" in predicate) return node.id === predicate.id;
  if (node.role !== predicate.role) return false;
  if (predicate.name === undefined) return true;
  return matchText(node.name, predicate.name);
}

function describeHandle(target: TargetHandle): string {
  return target.kind === "ui"
    ? JSON.stringify(target.locator, (_k, v: unknown) =>
        v instanceof RegExp ? v.toString() : v,
      )
    : `scene:${target.id}`;
}

async function resolvePoint(
  state: HarnessState,
  target: TargetHandle,
): Promise<{ x: number; y: number }> {
  if (target.kind === "scene") {
    if (state.adapter === undefined) {
      throw new Error("createHarness: scene handle requires an adapter");
    }
    const box = await Promise.resolve(state.adapter.locate(target.id));
    if (box === null) {
      throw new Error(`Scene node not hittable: ${target.id}`);
    }
    return bboxCenter(box);
  }
  if (state.driver === undefined) {
    throw new Error("createHarness: ui handle requires a PageDriver");
  }
  assertLocatorAllowed(target.locator);
  const dom = translateLocator(target.locator);
  const box = await state.driver.bbox(dom);
  if (box === null) {
    throw new Error(`UI locator has no bbox: ${describeHandle(target)}`);
  }
  return bboxCenter(box);
}

function toEnvelope(
  state: HarnessState,
  error: unknown,
  extras?: { step?: string; locator?: Locator; status?: FailureEnvelope["status"] },
): FailureEnvelope {
  if (error instanceof HarnessFailure) return error.envelope;
  if (error instanceof ExecutorFailure) return error.envelope;

  const status: FailureEnvelope["status"] =
    extras?.status ??
    (error instanceof AutoWaitTimeoutError || error instanceof StepStarvationError
      ? "timedOut"
      : "failed");

  return buildFailureEnvelope({
    testId: state.testId,
    file: state.file,
    title: state.title,
    seed: state.seed,
    tier: state.tier,
    error,
    status,
    ...(extras?.step !== undefined ? { step: extras.step } : {}),
    ...(extras?.locator !== undefined ? { locator: extras.locator } : {}),
  });
}

function wrapFailure(
  state: HarnessState,
  error: unknown,
  extras?: { step?: string; locator?: Locator },
): HarnessFailure {
  return new HarnessFailure(toEnvelope(state, error, extras));
}

async function refreshQuery(state: HarnessState): Promise<SceneQueryEngine> {
  if (state.adapter === undefined) {
    throw new Error(
      "createHarness: t.scene requires an adapter (pass adapter or bind a page scene bridge)",
    );
  }
  const nodes = await Promise.resolve(state.adapter.snapshot());
  state.query = createSceneQuery(nodes);
  return state.query;
}

/**
 * Live-by-default query load: re-snapshot unless frozen.
 * Sync adapters re-read on every sync query. Async adapters cannot; use the last
 * `await refresh()` / harness boot snapshot (call `refresh()` after mutations).
 */
function requireQuerySync(state: HarnessState): SceneQueryEngine {
  assertTierCapability(state.tier, "scene");
  if (state.adapter === undefined) {
    throw new Error(
      "createHarness: t.scene requires an adapter (pass adapter or bind a page scene bridge)",
    );
  }
  if (state.sceneFrozen && state.query !== undefined) {
    return state.query;
  }
  const result = state.adapter.snapshot();
  if (result instanceof Promise) {
    if (state.query !== undefined) {
      return state.query;
    }
    throw new Error(
      "t.scene: snapshot not loaded — await t.scene.refresh() first (async adapter.snapshot())",
    );
  }
  state.query = createSceneQuery(result);
  return state.query;
}

async function requireQueryLive(state: HarnessState): Promise<SceneQueryEngine> {
  assertTierCapability(state.tier, "scene");
  if (state.sceneFrozen && state.query !== undefined) {
    return state.query;
  }
  return refreshQuery(state);
}

function createUiSurface(state: HarnessState): UiSurface {
  const locate = (locator: Locator): UiHandle => {
    assertTierCapability(state.tier, "ui");
    assertLocatorAllowed(locator);
    return { kind: "ui", locator };
  };
  return {
    getByRole(role, options) {
      if (options?.name !== undefined && options.exact !== undefined) {
        return locate({ kind: "role", role, name: options.name, exact: options.exact });
      }
      if (options?.name !== undefined) {
        return locate({ kind: "role", role, name: options.name });
      }
      if (options?.exact !== undefined) {
        return locate({ kind: "role", role, exact: options.exact });
      }
      return locate({ kind: "role", role });
    },
    getByLabel(label, options) {
      if (options?.exact !== undefined) {
        return locate({ kind: "label", label, exact: options.exact });
      }
      return locate({ kind: "label", label });
    },
    getByText(text, options) {
      if (options?.exact !== undefined) {
        return locate({ kind: "text", text, exact: options.exact });
      }
      return locate({ kind: "text", text });
    },
    getByTestId(testId) {
      return locate({ kind: "testId", testId });
    },
    getByPlaceholder(placeholder, options) {
      if (options?.exact !== undefined) {
        return locate({ kind: "placeholder", placeholder, exact: options.exact });
      }
      return locate({ kind: "placeholder", placeholder });
    },
  };
}

function createSceneSurface(state: HarnessState): SceneSurface {
  return {
    getByRole(role: string, options?: GetByRoleOptions): SceneHandle {
      const node = requireQuerySync(state).getByRole(role, options);
      return { kind: "scene", id: node.id, node };
    },
    getBySceneId(id: string): SceneHandle {
      const node = requireQuerySync(state).getBySceneId(id);
      return { kind: "scene", id: node.id, node };
    },
    getByState(predicate: (node: SceneNode) => boolean): SceneHandle {
      const node = requireQuerySync(state).getByState(predicate);
      return { kind: "scene", id: node.id, node };
    },
    async snapshot(): Promise<SceneNode[]> {
      const q = await requireQueryLive(state);
      return [...q.nodes];
    },
    async refresh(): Promise<void> {
      assertTierCapability(state.tier, "scene");
      await refreshQuery(state);
    },
    freeze(): void {
      assertTierCapability(state.tier, "scene");
      if (state.query === undefined) {
        // Pin whatever a sync snapshot can load now.
        requireQuerySync(state);
      }
      state.sceneFrozen = true;
    },
  };
}

function createUserSurface(state: HarnessState): UserSurface {
  const run = async (step: string, target: TargetHandle | undefined, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof TierPromotionError || err instanceof StructuralLocatorDeniedError) {
        throw err;
      }
      const locator = target?.kind === "ui" ? target.locator : target
        ? ({ kind: "scene", id: target.id } as Locator)
        : undefined;
      throw wrapFailure(state, err, {
        step,
        ...(locator !== undefined ? { locator } : {}),
      });
    }
  };

  const dispatchClick = async (
    target: TargetHandle,
    options: PointerOptions | undefined,
    mode: "click" | "dblclick",
  ) => {
    const point = await resolvePoint(state, target);
    if (state.driver !== undefined) {
      if (mode === "dblclick") {
        await state.driver.dblclick(point);
      } else {
        await state.driver.click(point);
        if (options?.clickCount === 2) {
          await state.driver.click(point);
        }
      }
      return;
    }
    if (state.pointer !== undefined) {
      if (mode === "dblclick") {
        if (state.pointer.dblclick !== undefined) {
          await state.pointer.dblclick(point.x, point.y, options);
        } else {
          await state.pointer.click(point.x, point.y, options);
          await state.pointer.click(point.x, point.y, options);
        }
      } else {
        await state.pointer.click(point.x, point.y, options);
      }
      return;
    }
    throw new Error(
      "t.user: pointer dispatch requires a PageDriver or pointer sink " +
        "(pass driver or pointer to createHarness)",
    );
  };

  return {
    async click(target, options) {
      await run("click", target, () => dispatchClick(target, options, "click"));
    },
    async dblclick(target, options) {
      await run("dblclick", target, () => dispatchClick(target, options, "dblclick"));
    },
    async hover(target) {
      await run("hover", target, async () => {
        const point = await resolvePoint(state, target);
        if (state.driver !== undefined) {
          await state.driver.hover(point);
          return;
        }
        if (state.pointer?.hover !== undefined) {
          await state.pointer.hover(point.x, point.y);
          return;
        }
        throw new Error("t.user.hover: requires PageDriver or pointer.hover");
      });
    },
    async drag(from, to) {
      await run("drag", from, async () => {
        const a = await resolvePoint(state, from);
        const b = await resolvePoint(state, to);
        if (state.pointer?.drag !== undefined) {
          await state.pointer.drag(a, b);
          return;
        }
        if (state.driver !== undefined) {
          await state.driver.hover(a);
          await state.driver.click(a);
          await state.driver.hover(b);
          await state.driver.click(b);
          return;
        }
        throw new Error("t.user.drag: requires PageDriver or pointer.drag");
      });
    },
    async fill(target, value, options) {
      await run("fill", target, async () => {
        if (target.kind === "scene") {
          if (state.pointer?.fill !== undefined) {
            await state.pointer.fill(value, options);
            return;
          }
          throw new Error("t.user.fill: scene targets need pointer.fill or a ui handle");
        }
        if (state.driver === undefined) {
          throw new Error("t.user.fill: requires PageDriver");
        }
        assertLocatorAllowed(target.locator);
        const dom = translateLocator(target.locator);
        const fillOpts = options?.clear !== undefined ? { clear: options.clear } : undefined;
        await state.driver.fill(dom, value, fillOpts);
      });
    },
    async type(target, text, options) {
      await run("type", target, async () => {
        if (target.kind === "scene") {
          if (state.pointer?.type !== undefined) {
            await state.pointer.type(text, options);
            return;
          }
          throw new Error("t.user.type: scene targets need pointer.type or a ui handle");
        }
        if (state.driver === undefined) {
          throw new Error("t.user.type: requires PageDriver");
        }
        assertLocatorAllowed(target.locator);
        const dom = translateLocator(target.locator);
        const typeOpts: { delayMs?: number; clear?: boolean } = {};
        if (options?.delayMs !== undefined) typeOpts.delayMs = options.delayMs;
        if (options?.clear !== undefined) typeOpts.clear = options.clear;
        await state.driver.type(dom, text, typeOpts);
      });
    },
    async press(key) {
      await run("press", undefined, async () => {
        if (state.driver !== undefined) {
          await state.driver.press("page", key);
          return;
        }
        if (state.pointer?.press !== undefined) {
          await state.pointer.press(key);
          return;
        }
        throw new Error("t.user.press: requires PageDriver or pointer.press");
      });
    },
  };
}

function createExpectation(
  state: HarnessState,
  target: TargetHandle | (() => boolean | Promise<boolean>),
): Expectation {
  const poll = async (step: string, probe: () => Promise<boolean>) => {
    try {
      await harnessPoll(probe, {
        tier: state.tier,
        clock: state.clock,
        ...(state.stepLoop !== undefined ? { stepLoop: state.stepLoop } : {}),
        timeoutMs: state.timeoutMs,
        message: `Expectation ${step}`,
      });
    } catch (err) {
      if (err instanceof TierPromotionError) throw err;
      const locator =
        typeof target !== "function" && target.kind === "ui"
          ? target.locator
          : typeof target !== "function"
            ? ({ kind: "scene", id: target.id } as Locator)
            : undefined;
      throw wrapFailure(state, err, {
        step,
        ...(locator !== undefined ? { locator } : {}),
      });
    }
  };

  if (typeof target === "function") {
    return {
      async toBeVisible() {
        throw new Error("t.expect(fn): use toPass() for predicate expects");
      },
      async toBeHidden() {
        throw new Error("t.expect(fn): use toPass() for predicate expects");
      },
      async toHaveText() {
        throw new Error("t.expect(fn): use toPass() for predicate expects");
      },
      async toHaveCount() {
        throw new Error("t.expect(fn): use toPass() for predicate expects");
      },
      async toMatchScene() {
        throw new Error("t.expect(fn): use toPass() for predicate expects");
      },
      async toPass(fn, message) {
        await poll(message ?? "toPass", async () => fn());
      },
    };
  }

  const handle = target;

  return {
    async toBeVisible() {
      await poll("toBeVisible", async () => {
        if (handle.kind === "scene") {
          if (state.adapter === undefined) return false;
          const box = await Promise.resolve(state.adapter.locate(handle.id));
          return box !== null;
        }
        if (state.driver === undefined) return false;
        return state.driver.isVisible(translateLocator(handle.locator));
      });
    },
    async toBeHidden() {
      await poll("toBeHidden", async () => {
        if (handle.kind === "scene") {
          if (state.adapter === undefined) return true;
          const box = await Promise.resolve(state.adapter.locate(handle.id));
          return box === null;
        }
        if (state.driver === undefined) return true;
        return state.driver.isHidden(translateLocator(handle.locator));
      });
    },
    async toHaveText(expected) {
      await poll("toHaveText", async () => {
        if (handle.kind === "scene") {
          const nodes = state.adapter
            ? await Promise.resolve(state.adapter.snapshot())
            : [];
          const node = nodes.find((n) => n.id === handle.id);
          return node !== undefined && matchText(node.name, expected);
        }
        if (state.driver === undefined) return false;
        const text = await state.driver.textContent(translateLocator(handle.locator));
        return text !== null && matchText(text, expected);
      });
    },
    async toHaveCount(expected) {
      await poll("toHaveCount", async () => {
        if (handle.kind === "scene") {
          const nodes = state.adapter
            ? await Promise.resolve(state.adapter.snapshot())
            : [];
          return nodes.filter((n) => n.id === handle.id).length === expected;
        }
        if (state.driver === undefined) return false;
        const count = await state.driver.count(translateLocator(handle.locator));
        return count === expected;
      });
    },
    async toMatchScene(predicate) {
      await poll("toMatchScene", async () => {
        if (state.adapter === undefined) return false;
        const nodes = await Promise.resolve(state.adapter.snapshot());
        return nodes.some((n) => matchScenePredicate(n, predicate));
      });
    },
    async toPass(fn, message) {
      await poll(message ?? "toPass", async () => fn());
    },
  };
}

function createGoldenSurface(state: HarnessState): GoldenSurface {
  return {
    async compare(testId: string, frame: RasterFrame) {
      assertTierCapability(state.tier, "golden");
      if (state.goldenStore === undefined) {
        throw new Error("t.golden.compare: pass goldenStore to createHarness");
      }
      try {
        return await state.goldenStore.compare(testId, frame);
      } catch (err) {
        throw wrapFailure(state, err, { step: "golden.compare" });
      }
    },
  };
}

/**
 * Create the unified tiered harness.
 *
 * Same object shape across tiers; dead members throw {@link TierPromotionError}.
 * Failures normalize to core {@link FailureEnvelope} with seed + tier.
 */
export async function createHarness(options: CreateHarnessOptions): Promise<TestHarness> {
  const tier = options.tier;
  const caps = TIER_CAPABILITIES[tier];

  if (caps.ui && options.driver === undefined) {
    // ui surface exists but actions need a driver — allow construction for gating tests
  }

  // CLI contract: `scenelock run --seed` / `scenelock replay` pin the seed via
  // SCENELOCK_SEED; an explicit option always wins over the environment.
  const envSeed =
    typeof process !== "undefined" ? process.env?.["SCENELOCK_SEED"] : undefined;
  const seed = options.seed ?? (envSeed !== undefined && envSeed !== "" ? envSeed : undefined);

  const executor = createExecutor({
    tier,
    ...(seed !== undefined ? { seed } : {}),
    ...(options.stepLoop !== undefined ? { stepLoop: options.stepLoop } : {}),
  });

  const clock: VirtualClock = caps.determinism
    ? createVirtualClock()
    : createRealClockShim();

  if (caps.determinism) {
    clock.install?.();
  }

  const state: HarnessState = {
    tier,
    seed: executor.seed.value,
    rng: executor.random,
    clock,
    timeoutMs: options.timeoutMs ?? 5000,
    testId: options.testId ?? "harness",
    file: options.file ?? "unknown",
    title: options.title ?? "harness",
    adapter: options.adapter,
    driver: options.driver,
    pointer: options.pointer,
    stepLoop: options.stepLoop,
    goldenStore: options.goldenStore,
    query: undefined,
    sceneFrozen: false,
    disposed: false,
    clockInstalled: caps.determinism,
  };

  if (state.adapter !== undefined) {
    await refreshQuery(state);
  }

  const uiLive = createUiSurface(state);
  const sceneLive = createSceneSurface(state);
  const userLive = createUserSurface(state);
  const expectLive: ExpectSurface = ((target) =>
    createExpectation(state, target)) as ExpectSurface;
  const goldenLive = createGoldenSurface(state);

  const fixedDt = 16;

  const api: TestHarness = {
    tier,
    seed: state.seed,
    get ui(): UiSurface {
      assertTierCapability(tier, "ui");
      return uiLive;
    },
    scene: sceneLive,
    user: userLive,
    clock: state.clock,
    rng: state.rng,
    async step(deltaMs = fixedDt) {
      if (state.stepLoop !== undefined) {
        await state.stepLoop.step(deltaMs);
        await state.stepLoop.settled();
      } else if (caps.determinism) {
        state.clock.advance(deltaMs);
      }
      // smoke: real clock — step is a no-op without stepLoop
    },
    async stepUntil(predicate, options?: StepUntilOptions) {
      if (state.stepLoop?.stepUntil !== undefined) {
        await state.stepLoop.stepUntil(predicate, options);
        return;
      }
      const maxSteps = options?.maxSteps ?? DEFAULT_STEP_UNTIL_MAX_STEPS;
      for (let i = 0; i < maxSteps; i++) {
        if (await predicate()) return;
        await api.step(fixedDt);
      }
      throw wrapFailure(state, new StepStarvationError(maxSteps, maxSteps), {
        step: "stepUntil",
      });
    },
    async settled() {
      if (state.adapter !== undefined) {
        await awaitSettled(state.adapter, {
          timeoutMs: state.timeoutMs,
          ...(state.stepLoop !== undefined
            ? {
                step: async (dt: number) => {
                  await state.stepLoop!.step(dt);
                },
                stepDeltaMs: fixedDt,
              }
            : {}),
        });
        return;
      }
      if (state.stepLoop !== undefined) {
        await state.stepLoop.settled();
      }
    },
    expect: expectLive,
    get golden(): GoldenSurface {
      assertTierCapability(tier, "golden");
      return goldenLive;
    },
    toFailureEnvelope(error, extras) {
      return toEnvelope(state, error, extras);
    },
    async dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (state.clockInstalled) {
        await state.clock.uninstall?.();
      }
      // Do not close an injected driver — caller owns its lifecycle.
    },
  };

  return api;
}
