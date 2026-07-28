import { describe, expect, it } from "vitest";
import type {
  ExecutorContext,
  FailureEnvelope,
  Locator,
  SceneAdapter,
  Seed,
  SeededRandom,
  VirtualClock,
} from "@scenelock/core";
import { FAILURE_ENVELOPE_JSON_SCHEMA } from "@scenelock/core";
import {
  AutoWaitTimeoutError,
  BrowserActionError,
  CROSS_ORIGIN_ISOLATION_HEADERS,
  FakePageDriver,
  StructuralLocatorDeniedError,
  assertCrossOriginIsolated,
  assertLocatorAllowed,
  buildBrowserFailure,
  createBrowserEngine,
  createBrowserSession,
  createPageSceneAdapter,
  isFailureEnvelopeShape,
  pollUntil,
  translateLocator,
} from "../index.js";

function fakeSeed(value = "seed-1"): Seed {
  return { value, numeric: 1 };
}

function fakeClock(): VirtualClock {
  let t = 0;
  let nextId = 1;
  return {
    now: () => t,
    advance: (d) => {
      t += d;
    },
    set: (ms) => {
      t = ms;
    },
    setTimeout: () => ({ id: nextId++ }),
    setInterval: () => ({ id: nextId++ }),
    clearTimeout: () => undefined,
    clearInterval: () => undefined,
    pendingTimers: () => 0,
  };
}

function fakeRandom(): SeededRandom {
  return {
    next: () => 0.5,
    int: (min, max) => min + Math.floor((max - min) / 2),
    shuffle: <T>(items: readonly T[]) => [...items],
  };
}

function fakeCtx(): ExecutorContext {
  return {
    seed: fakeSeed(),
    clock: fakeClock(),
    random: fakeRandom(),
    tier: "browser",
    async tick() {
      throw new Error("no stepLoop");
    },
  };
}

describe("locator translation", () => {
  it("maps the a11y ladder to driver locators", () => {
    const table: Array<{ locator: Locator; expectedKind: string }> = [
      { locator: { kind: "role", role: "button", name: "Save" }, expectedKind: "role" },
      { locator: { kind: "label", label: "Email" }, expectedKind: "label" },
      { locator: { kind: "text", text: "Hello" }, expectedKind: "text" },
      { locator: { kind: "placeholder", placeholder: "Search" }, expectedKind: "placeholder" },
      { locator: { kind: "alt", alt: "Logo" }, expectedKind: "alt" },
      { locator: { kind: "testId", testId: "canvas" }, expectedKind: "testId" },
    ];

    for (const row of table) {
      const translated = translateLocator(row.locator);
      expect(translated.kind).toBe(row.expectedKind);
    }

    expect(translateLocator({ kind: "role", role: "button", name: "Save" })).toEqual({
      kind: "role",
      role: "button",
      name: "Save",
    });
    expect(translateLocator({ kind: "testId", testId: "x" })).toEqual({
      kind: "testId",
      testId: "x",
    });
  });

  it("translates structural CSS/XPath only when allowStructural is true", () => {
    expect(translateLocator({ kind: "structural", css: ".foo", allowStructural: true })).toEqual({
      kind: "css",
      css: ".foo",
    });
    expect(
      translateLocator({ kind: "structural", xpath: "//div", allowStructural: true }),
    ).toEqual({ kind: "xpath", xpath: "//div" });
  });

  it("refuses structural locators without allowStructural", () => {
    expect(() =>
      assertLocatorAllowed({ kind: "structural", css: ".foo" } as never),
    ).toThrow(StructuralLocatorDeniedError);
    expect(() => translateLocator({ kind: "structural", css: ".foo" } as never)).toThrow(
      /denied by default/,
    );
  });

  it("refuses translating scene locators to DOM targets", () => {
    expect(() => translateLocator({ kind: "scene", id: "shape-1" })).toThrow(/scene\.locate/);
  });
});

describe("auto-wait retry loop", () => {
  it("succeeds on the Nth poll via FakePageDriver", async () => {
    const driver = new FakePageDriver({
      elements: [
        {
          id: "btn",
          role: "button",
          name: "Go",
          availableAfterPolls: 3,
        },
      ],
    });

    const session = await createBrowserSession({ driver, ctx: fakeCtx() });
    await session.harness().getByRole("button", { name: "Go" }).click();
    expect(driver.actions).toContain("click:btn");
    await session.close();
  });

  it("pollUntil resolves when probe eventually returns a value", async () => {
    let n = 0;
    const value = await pollUntil(
      async () => {
        n += 1;
        return n >= 4 ? "ok" : null;
      },
      { message: "nth", timeoutMs: 1000, intervalMs: 5 },
    );
    expect(value).toBe("ok");
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it("times out when the element never appears", async () => {
    const driver = new FakePageDriver({ elements: [] });
    const session = await createBrowserSession({
      driver,
      ctx: fakeCtx(),
      harness: { poll: { timeoutMs: 40, intervalMs: 5 } },
    });

    await expect(session.harness().getByRole("button", { name: "Missing" }).click()).rejects.toBeInstanceOf(
      BrowserActionError,
    );

    try {
      await session.harness().getByTestId("nope").expect().toBeVisible();
    } catch (err) {
      expect(err).toBeInstanceOf(BrowserActionError);
      const envelope = (err as BrowserActionError).envelope;
      expect(envelope.status).toBe("timedOut");
      expect(envelope.tier).toBe("browser");
    }

    await session.close();
  });

  it("exposes AutoWaitTimeoutError from pollUntil", async () => {
    await expect(
      pollUntil(async () => null, { message: "never", timeoutMs: 30, intervalMs: 5 }),
    ).rejects.toBeInstanceOf(AutoWaitTimeoutError);
  });
});

describe("failure envelope", () => {
  it("buildBrowserFailure matches required schema keys", () => {
    const envelope = buildBrowserFailure({
      testId: "t1",
      file: "a.spec.ts",
      title: "clicks",
      seed: "seed-1",
      error: { message: "boom", matcher: "click" },
      locator: { kind: "role", role: "button", name: "Save" },
      step: "click",
      screenshotPath: "artifacts/failure.png",
    });

    expect(envelope.tier).toBe("browser");
    expect(envelope.seed).toBe("seed-1");
    expect(envelope.artifacts.screenshot).toBe("artifacts/failure.png");
    expect(isFailureEnvelopeShape(envelope)).toBe(true);

    for (const key of FAILURE_ENVELOPE_JSON_SCHEMA.required) {
      expect(envelope).toHaveProperty(key);
    }
  });

  it("failed actions capture screenshot path pointers (not blobs)", async () => {
    const driver = new FakePageDriver({ elements: [] });
    const session = await createBrowserSession({
      driver,
      ctx: fakeCtx(),
      harness: {
        poll: { timeoutMs: 30, intervalMs: 5 },
        artifactDir: "artifacts/test",
        testId: "fail-1",
        file: "browser.test.ts",
        title: "missing click",
      },
    });

    let envelope: FailureEnvelope | undefined;
    try {
      await session.harness().getByRole("button", { name: "Nope" }).click();
    } catch (err) {
      expect(err).toBeInstanceOf(BrowserActionError);
      envelope = (err as BrowserActionError).envelope;
    }

    expect(envelope).toBeDefined();
    expect(envelope!.tier).toBe("browser");
    expect(envelope!.seed).toBe("seed-1");
    expect(envelope!.locator).toEqual({ kind: "role", role: "button", name: "Nope" });
    expect(envelope!.step).toBe("click");
    expect(envelope!.artifacts.screenshot).toMatch(/^artifacts\/test\/failure-/);
    expect(typeof envelope!.artifacts.screenshot).toBe("string");
    expect(driver.screenshotPaths.length).toBeGreaterThan(0);
    await session.close();
  });
});

describe("session + scene bridge", () => {
  it("goto + COOP/COEP headers + crossOriginIsolated assert", async () => {
    const driver = new FakePageDriver({ crossOriginIsolated: false });
    const session = await createBrowserSession({
      driver,
      ctx: fakeCtx(),
      launch: { crossOriginIsolated: true },
    });

    expect(driver.getExtraHTTPHeaders()).toMatchObject(CROSS_ORIGIN_ISOLATION_HEADERS);
    await session.goto("http://localhost:3000/");
    expect(driver.getUrl()).toBe("http://localhost:3000/");

    await expect(assertCrossOriginIsolated(driver)).rejects.toThrow(/crossOriginIsolated/);
    driver.setCrossOriginIsolated(true);
    await expect(assertCrossOriginIsolated(driver)).resolves.toBeUndefined();
    await session.close();
  });

  it("getBySceneId aims pointer at locate() bbox center", async () => {
    const driver = new FakePageDriver();
    const scene: SceneAdapter = {
      snapshot: () => [
        {
          id: "rect-1",
          role: "shape",
          name: "Rect",
          bbox: { x: 10, y: 20, width: 40, height: 60 },
        },
      ],
      locate: (id) =>
        id === "rect-1" ? { x: 10, y: 20, width: 40, height: 60 } : null,
      settled: async () => {},
    };

    const session = await createBrowserSession({ driver, ctx: fakeCtx() });
    session.bindScene(scene);
    await session.harness().getBySceneId("rect-1").click();
    // center of 10,20,40x60 → 30,50
    expect(driver.actions).toContain("click:@30,50");
    await session.close();
  });

  it("page scene adapter bridge via evaluate()", async () => {
    const driver = new FakePageDriver({
      pageSceneAdapter: {
        snapshot: () => [
          { id: "n1", role: "shape", name: "A", bbox: { x: 0, y: 0, width: 20, height: 20 } },
        ],
        locate: (id) =>
          id === "n1" ? { x: 0, y: 0, width: 20, height: 20 } : null,
        settled: async () => {},
      },
    });

    const adapter = createPageSceneAdapter(driver);
    const nodes = await adapter.snapshot();
    expect(nodes).toHaveLength(1);
    expect(await adapter.locate("n1")).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    await adapter.settled();
  });

  it("fill + expect toHaveValue with auto-wait", async () => {
    const driver = new FakePageDriver({
      elements: [
        {
          id: "email",
          role: "textbox",
          name: "Email",
          label: "Email",
          availableAfterPolls: 2,
          value: "",
        },
      ],
    });
    const session = await createBrowserSession({
      driver,
      ctx: fakeCtx(),
      harness: { poll: { timeoutMs: 500, intervalMs: 5 } },
    });
    await session.harness().getByLabel("Email").fill("a@b.c");
    await session.harness().getByLabel("Email").expect().toHaveValue("a@b.c");
    await session.close();
  });
});

describe("createBrowserEngine factory", () => {
  it("returns a BrowserEngine with headless-default factory", () => {
    expect(createBrowserEngine).toBeTypeOf("function");
    const engine = createBrowserEngine({ headless: true });
    expect(engine.launch).toBeTypeOf("function");
    expect(engine.newSession).toBeTypeOf("function");
    expect(engine.close).toBeTypeOf("function");
  });

  it("keeps CROSS_ORIGIN_ISOLATION_HEADERS stable", () => {
    expect(CROSS_ORIGIN_ISOLATION_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(CROSS_ORIGIN_ISOLATION_HEADERS["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  });
});
