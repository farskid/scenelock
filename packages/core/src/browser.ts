import type { Locator } from "./locators.js";
import type { Harness, HarnessHandle } from "./dsl.js";
import type { ExecutorContext } from "./executor.js";
import type { SceneAdapter } from "./scene.js";

/**
 * Browser tier contracts — Playwright is the engine (research 01).
 * Wrap `playwright` library; do not lock the public API to @playwright/test fixtures.
 */

export interface BrowserLaunchOptions {
  headless?: boolean;
  /** Chromium-only in default CI matrix. */
  channel?: "chromium" | "firefox" | "webkit";
  /**
   * COOP/COEP headers for SharedArrayBuffer hosts (Creator).
   * Test server must serve COOP: same-origin + COEP: require-corp.
   */
  crossOriginIsolated?: boolean;
  /** Extra HTTP headers applied to the browser context (and optional test server). */
  extraHTTPHeaders?: Readonly<Record<string, string>>;
}

export interface BrowserSession {
  readonly ctx: ExecutorContext;
  harness(): Harness;
  /** Navigate and wait for harness-owned ready signal / settled. */
  goto(url: string): Promise<void>;
  /** Bind a scene adapter exposed by the page (test-mode hook). */
  bindScene(adapter: SceneAdapter): void;
  /** Fresh context isolation helper — close this session. */
  close(): Promise<void>;
}

export interface BrowserEngine {
  launch(options?: BrowserLaunchOptions): Promise<BrowserEngine>;
  newSession(ctx: ExecutorContext, options?: BrowserLaunchOptions): Promise<BrowserSession>;
  close(): Promise<void>;
}

/**
 * Maps harness locators to engine locators.
 * Must enforce a11y-primary policy; structural requires allowStructural.
 */
export interface LocatorBridge {
  resolve(locator: Locator): HarnessHandle;
}
