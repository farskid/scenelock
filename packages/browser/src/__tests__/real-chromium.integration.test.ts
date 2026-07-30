import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExecutorContext,
  Seed,
  SeededRandom,
  VirtualClock,
} from "@scenelock/core";
import {
  BrowserActionError,
  StructuralLocatorDeniedError,
  assertCrossOriginIsolated,
  createBrowserSession,
  createPageSceneAdapter,
  isFailureEnvelopeShape,
  launchPlaywrightDriver,
  type PlaywrightDriverHandle,
} from "../index.js";
import { startFixtureServer, type FixtureServer } from "./real-chromium-fixture.js";

const enabled = process.env["SCENELOCK_REAL_BROWSER"] === "1";

function fakeSeed(value = "real-chromium-1"): Seed {
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

describe.runIf(enabled)("real Chromium integration", () => {
  let server: FixtureServer;
  let handle: PlaywrightDriverHandle;

  beforeAll(async () => {
    server = await startFixtureServer();
    handle = await launchPlaywrightDriver({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await handle?.close();
    await server?.close();
  });

  it("asserts crossOriginIsolated === true in-page (COOP/COEP)", async () => {
    await handle.driver.goto(server.url);
    await assertCrossOriginIsolated(handle.driver);
    const isolated = await handle.driver.evaluate(
      () => (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
      undefined as void,
    );
    expect(isolated).toBe(true);
  });

  it("locator ladder: role click, label fill, testId, press; structural CSS refused", async () => {
    await handle.driver.goto(server.url);
    const session = await createBrowserSession({
      driver: handle.driver,
      ctx: fakeCtx(),
      harness: { poll: { timeoutMs: 5000, intervalMs: 25 } },
    });

    await session.harness().getByRole("button", { name: "Save" }).click();
    const status = await handle.driver.textContent({ kind: "css", css: "#status" });
    expect(status).toContain("saved");

    await session.harness().getByLabel("Email").fill("a@b.c");
    await session.harness().getByLabel("Email").expect().toHaveValue("a@b.c");

    await session.harness().getByTestId("marker").expect().toBeVisible();
    await session.harness().getByLabel("Email").press("Enter");

    expect(() =>
      session.harness().locate({ kind: "structural", css: "#status" } as never),
    ).toThrow(StructuralLocatorDeniedError);

    // Do not close the shared driver — only the session wrapper flag.
    // DriverBrowserSession.close() closes the page; keep page for later tests.
    // Use a no-op close path by not calling session.close() on shared handle.
  });

  it("auto-waits until Late button is enabled (no test-side sleeps)", async () => {
    await handle.driver.goto(server.url);
    const session = await createBrowserSession({
      driver: handle.driver,
      ctx: fakeCtx(),
      harness: { poll: { timeoutMs: 5000, intervalMs: 25 } },
    });
    // Button starts disabled; harness/driver auto-wait until actionable.
    await session.harness().getByRole("button", { name: "Late" }).click();
  });

  it("scene bridge: createPageSceneAdapter snapshot/locate round-trip", async () => {
    await handle.driver.goto(server.url);
    const adapter = createPageSceneAdapter(handle.driver, {
      contractVersion: "fixture-v1",
      forwardHitTest: true,
    });
    const nodes = await adapter.snapshot();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "shape-1",
      role: "shape",
      name: "Box",
      bbox: { x: 20, y: 20, width: 80, height: 60 },
    });
    expect(await adapter.locate("shape-1")).toEqual({
      x: 20,
      y: 20,
      width: 80,
      height: 60,
    });
    expect(await adapter.locate("missing")).toBeNull();
    await adapter.settled();
    expect(await adapter.hitTest?.({ x: 40, y: 40 })).toBe("shape-1");
    expect(await adapter.hitTest?.({ x: 0, y: 0 })).toBeNull();
  });

  it("failure capture: Failed assertion → FailureEnvelope tier browser + screenshot on disk", async () => {
    await handle.driver.goto(server.url);
    const artifactDir = mkdtempSync(join(tmpdir(), "scenelock-real-"));
    try {
      const session = await createBrowserSession({
        driver: handle.driver,
        ctx: fakeCtx(),
        harness: {
          poll: { timeoutMs: 400, intervalMs: 25 },
          artifactDir,
          testId: "real-fail-1",
          file: "real-chromium.integration.test.ts",
          title: "missing control",
        },
      });

      let caught: BrowserActionError | undefined;
      try {
        await session.harness().getByRole("button", { name: "DoesNotExist" }).expect().toBeVisible();
      } catch (err) {
        expect(err).toBeInstanceOf(BrowserActionError);
        caught = err as BrowserActionError;
      }

      expect(caught).toBeDefined();
      const envelope = caught!.envelope;
      expect(isFailureEnvelopeShape(envelope)).toBe(true);
      expect(envelope.tier).toBe("browser");
      expect(envelope.status).toBe("timedOut");
      expect(envelope.artifacts.screenshot).toBeTypeOf("string");
      const shot = envelope.artifacts.screenshot!;
      expect(shot.startsWith(artifactDir)).toBe(true);
      expect(existsSync(shot)).toBe(true);
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });
});

describe.runIf(!enabled)("real Chromium integration (skipped without SCENELOCK_REAL_BROWSER=1)", () => {
  it("skips cleanly when env gate is off", () => {
    expect(enabled).toBe(false);
  });
});
