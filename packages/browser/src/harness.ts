import {
  bboxCenter,
  type Expectation,
  type ExecutorContext,
  type Harness,
  type HarnessHandle,
  type Locator,
  type PointerOptions,
  type SceneAdapter,
  type SceneNode,
  type ScenePredicate,
  type TypeOptions,
} from "@scenelock/core";
import { AutoWaitTimeoutError, pollUntil, type PollOptions } from "./auto-wait.js";
import type { DriverLocator, DriverPoint, PageDriver } from "./driver.js";
import { BrowserActionError, buildBrowserFailure } from "./failure.js";
import { assertLocatorAllowed, translateLocator } from "./locators.js";

/**
 * Browser-tier {@link Harness} — auto-waiting handles over a {@link PageDriver}.
 */

export interface BrowserHarnessOptions {
  readonly driver: PageDriver;
  readonly ctx: ExecutorContext;
  readonly scene?: SceneAdapter;
  readonly poll?: PollOptions;
  /** Directory (or prefix) for failure screenshot path pointers. Default "artifacts". */
  readonly artifactDir?: string;
  readonly testId?: string;
  readonly file?: string;
  readonly title?: string;
}

export class BrowserHarness implements Harness {
  private readonly driver: PageDriver;
  private readonly executorCtx: ExecutorContext;
  private sceneAdapter: SceneAdapter | undefined;
  private readonly poll: PollOptions;
  private readonly artifactDir: string;
  private readonly testId: string;
  private readonly file: string;
  private readonly title: string;

  constructor(options: BrowserHarnessOptions) {
    this.driver = options.driver;
    this.executorCtx = options.ctx;
    this.sceneAdapter = options.scene;
    this.poll = options.poll ?? {};
    this.artifactDir = options.artifactDir ?? "artifacts";
    this.testId = options.testId ?? "browser-harness";
    this.file = options.file ?? "unknown";
    this.title = options.title ?? "browser harness";
  }

  /** Bind or replace the scene adapter (DOM chrome + canvas). */
  bindScene(adapter: SceneAdapter): void {
    this.sceneAdapter = adapter;
  }

  locate(locator: Locator): HarnessHandle {
    assertLocatorAllowed(locator);
    return new BrowserHarnessHandle(this, locator);
  }

  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): HarnessHandle {
    if (options?.name !== undefined && options.exact !== undefined) {
      return this.locate({ kind: "role", role, name: options.name, exact: options.exact });
    }
    if (options?.name !== undefined) {
      return this.locate({ kind: "role", role, name: options.name });
    }
    if (options?.exact !== undefined) {
      return this.locate({ kind: "role", role, exact: options.exact });
    }
    return this.locate({ kind: "role", role });
  }

  getByLabel(label: string | RegExp, options?: { exact?: boolean }): HarnessHandle {
    if (options?.exact !== undefined) {
      return this.locate({ kind: "label", label, exact: options.exact });
    }
    return this.locate({ kind: "label", label });
  }

  getByText(text: string | RegExp, options?: { exact?: boolean }): HarnessHandle {
    if (options?.exact !== undefined) {
      return this.locate({ kind: "text", text, exact: options.exact });
    }
    return this.locate({ kind: "text", text });
  }

  getByTestId(testId: string): HarnessHandle {
    return this.locate({ kind: "testId", testId });
  }

  getBySceneId(id: string): HarnessHandle {
    return this.locate({ kind: "scene", id });
  }

  scene(): SceneAdapter {
    if (this.sceneAdapter === undefined) {
      throw new Error(
        "BrowserHarness.scene(): no SceneAdapter bound. Call session.bindScene() or pass scene in options.",
      );
    }
    return this.sceneAdapter;
  }

  async snapshotScene(): Promise<SceneNode[]> {
    return Promise.resolve(this.scene().snapshot());
  }

  async settled(): Promise<void> {
    if (this.sceneAdapter !== undefined) {
      await this.sceneAdapter.settled();
      return;
    }
    if (this.executorCtx.stepLoop !== undefined) {
      await this.executorCtx.stepLoop.settled();
      return;
    }
    /* No host settledness signal — resolve immediately. */
  }

  ctx(): ExecutorContext {
    return this.executorCtx;
  }

  /** @internal */
  getDriver(): PageDriver {
    return this.driver;
  }

  /** @internal */
  getPoll(): PollOptions {
    return this.poll;
  }

  /** @internal */
  async captureFailure(
    err: unknown,
    locator: Locator | undefined,
    step: string,
    status: "failed" | "timedOut" = "failed",
  ): Promise<BrowserActionError> {
    const screenshotPath = `${this.artifactDir}/failure-${Date.now()}.png`;
    try {
      await this.driver.screenshot(screenshotPath);
    } catch {
      /* screenshot best-effort */
    }

    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const error =
      stack !== undefined
        ? { message, stack, matcher: step }
        : { message, matcher: step };

    const envelope = buildBrowserFailure({
      testId: this.testId,
      file: this.file,
      title: this.title,
      seed: this.executorCtx.seed.value,
      error,
      status,
      step,
      ...(locator !== undefined ? { locator } : {}),
      screenshotPath,
    });
    return new BrowserActionError(envelope);
  }
}

class BrowserHarnessHandle implements HarnessHandle {
  constructor(
    private readonly harness: BrowserHarness,
    private readonly locator: Locator,
  ) {}

  async click(options?: PointerOptions): Promise<void> {
    await this.runAction("click", async () => {
      const target = await this.resolveTarget();
      await this.harness.getDriver().click(target);
      if (options?.clickCount === 2) {
        await this.harness.getDriver().click(target);
      }
    });
  }

  async dblclick(_options?: PointerOptions): Promise<void> {
    await this.runAction("dblclick", async () => {
      const target = await this.resolveTarget();
      await this.harness.getDriver().dblclick(target);
    });
  }

  async hover(): Promise<void> {
    await this.runAction("hover", async () => {
      const target = await this.resolveTarget();
      await this.harness.getDriver().hover(target);
    });
  }

  async fill(value: string, options?: TypeOptions): Promise<void> {
    await this.runAction("fill", async () => {
      const dom = await this.requireDomLocator("fill");
      const fillOpts = options?.clear !== undefined ? { clear: options.clear } : undefined;
      await this.harness.getDriver().fill(dom, value, fillOpts);
    });
  }

  async type(text: string, options?: TypeOptions): Promise<void> {
    await this.runAction("type", async () => {
      const dom = await this.requireDomLocator("type");
      const typeOpts: { delayMs?: number; clear?: boolean } = {};
      if (options?.delayMs !== undefined) typeOpts.delayMs = options.delayMs;
      if (options?.clear !== undefined) typeOpts.clear = options.clear;
      await this.harness.getDriver().type(dom, text, typeOpts);
    });
  }

  async press(key: string): Promise<void> {
    await this.runAction("press", async () => {
      if (this.locator.kind === "scene") {
        await this.harness.getDriver().press("page", key);
        return;
      }
      const dom = translateLocator(this.locator);
      await this.harness.getDriver().press(dom, key);
    });
  }

  async bbox() {
    if (this.locator.kind === "scene") {
      return this.harness.scene().locate(this.locator.id);
    }
    const dom = translateLocator(this.locator);
    return this.harness.getDriver().bbox(dom);
  }

  expect(): Expectation {
    return new BrowserExpectation(this.harness, this.locator);
  }

  private async runAction(step: string, fn: () => Promise<void>): Promise<void> {
    try {
      await pollUntil(
        async () => {
          await fn();
          return true;
        },
        {
          ...this.harness.getPoll(),
          message: `Auto-wait action "${step}" for ${describeLocator(this.locator)}`,
        },
      );
    } catch (err) {
      const status = err instanceof AutoWaitTimeoutError ? "timedOut" : "failed";
      throw await this.harness.captureFailure(err, this.locator, step, status);
    }
  }

  private async resolveTarget(): Promise<DriverLocator | DriverPoint> {
    if (this.locator.kind === "scene") {
      const box = await Promise.resolve(this.harness.scene().locate(this.locator.id));
      if (box === null) {
        throw new Error(`Scene node not found / not hittable: ${this.locator.id}`);
      }
      return bboxCenter(box);
    }
    const dom = translateLocator(this.locator);
    const visible = await this.harness.getDriver().isVisible(dom);
    if (!visible) {
      throw new Error(`Locator not visible: ${describeLocator(this.locator)}`);
    }
    return dom;
  }

  private async requireDomLocator(step: string): Promise<DriverLocator> {
    if (this.locator.kind === "scene") {
      throw new Error(`Cannot ${step} a scene locator; aim pointer events via click/hover.`);
    }
    const dom = translateLocator(this.locator);
    const visible = await this.harness.getDriver().isVisible(dom);
    if (!visible) {
      throw new Error(`Locator not visible for ${step}: ${describeLocator(this.locator)}`);
    }
    return dom;
  }
}

class BrowserExpectation implements Expectation {
  constructor(
    private readonly harness: BrowserHarness,
    private readonly locator: Locator,
  ) {}

  async toBeVisible(): Promise<void> {
    const locator = this.locator;
    await this.pollAssert("toBeVisible", async () => {
      if (locator.kind === "scene") {
        const box = await Promise.resolve(this.harness.scene().locate(locator.id));
        return box !== null;
      }
      return this.harness.getDriver().isVisible(translateLocator(locator));
    });
  }

  async toBeHidden(): Promise<void> {
    const locator = this.locator;
    await this.pollAssert("toBeHidden", async () => {
      if (locator.kind === "scene") {
        const box = await Promise.resolve(this.harness.scene().locate(locator.id));
        return box === null;
      }
      return this.harness.getDriver().isHidden(translateLocator(locator));
    });
  }

  async toHaveText(expected: string | RegExp): Promise<void> {
    const locator = this.locator;
    await this.pollAssert("toHaveText", async () => {
      if (locator.kind === "scene") {
        const nodes = await Promise.resolve(this.harness.scene().snapshot());
        const node = nodes.find((n) => n.id === locator.id);
        if (node === undefined) return false;
        return matchText(node.name, expected);
      }
      const text = await this.harness.getDriver().textContent(translateLocator(locator));
      return text !== null && matchText(text, expected);
    });
  }

  async toHaveValue(expected: string | RegExp): Promise<void> {
    const locator = this.locator;
    await this.pollAssert("toHaveValue", async () => {
      if (locator.kind === "scene") {
        throw new Error("toHaveValue is not supported for scene locators");
      }
      const value = await this.harness.getDriver().inputValue(translateLocator(locator));
      return value !== null && matchText(value, expected);
    });
  }

  async toHaveCount(expected: number): Promise<void> {
    const locator = this.locator;
    await this.pollAssert("toHaveCount", async () => {
      if (locator.kind === "scene") {
        const nodes = await Promise.resolve(this.harness.scene().snapshot());
        return nodes.filter((n) => n.id === locator.id).length === expected;
      }
      const count = await this.harness.getDriver().count(translateLocator(locator));
      return count === expected;
    });
  }

  async toMatchScene(predicate: ScenePredicate): Promise<void> {
    await this.pollAssert("toMatchScene", async () => {
      const nodes = await Promise.resolve(this.harness.scene().snapshot());
      return nodes.some((n) => matchScenePredicate(n, predicate));
    });
  }

  async toPass(fn: (actual: unknown) => boolean | Promise<boolean>, message?: string): Promise<void> {
    await this.pollAssert(message ?? "toPass", async () => fn(undefined));
  }

  private async pollAssert(step: string, probe: () => Promise<boolean>): Promise<void> {
    try {
      await pollUntil(
        async () => {
          const ok = await probe();
          return ok ? true : null;
        },
        {
          ...this.harness.getPoll(),
          message: `Expectation ${step} for ${describeLocator(this.locator)}`,
        },
      );
    } catch (err) {
      const status = err instanceof AutoWaitTimeoutError ? "timedOut" : "failed";
      throw await this.harness.captureFailure(err, this.locator, step, status);
    }
  }
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

function describeLocator(locator: Locator): string {
  return JSON.stringify(locator, (_k, v: unknown) => (v instanceof RegExp ? v.toString() : v));
}
