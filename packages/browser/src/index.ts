import type {
  BrowserEngine,
  BrowserLaunchOptions,
  BrowserSession,
  ExecutorContext,
  Locator,
  LocatorBridge,
  StructuralLocator,
} from "@scenelock/core";
import { DEFAULT_LOCATOR_PRIORITY } from "@scenelock/core";

/**
 * @scenelock/browser — Playwright-wrapped browser tier.
 * Wraps `playwright` library (not @playwright/test as the product surface).
 * Locator policy: role → label/text → testId; structural CSS denied by default.
 */

export type { BrowserEngine, BrowserLaunchOptions, BrowserSession, LocatorBridge };

export { DEFAULT_LOCATOR_PRIORITY };

export class StructuralLocatorDeniedError extends Error {
  constructor(locator: StructuralLocator) {
    super(
      `Structural locators are denied by default (css=${locator.css ?? ""}, xpath=${locator.xpath ?? ""}). Pass allowStructural: true only as an explicit escape.`,
    );
    this.name = "StructuralLocatorDeniedError";
  }
}

/** Policy gate used by the Playwright locator bridge. */
export function assertLocatorAllowed(locator: Locator): void {
  if (locator.kind === "structural" && locator.allowStructural !== true) {
    throw new StructuralLocatorDeniedError(locator);
  }
}

/**
 * Scaffold engine — real Playwright launch/session lands in phase 2.
 * Keeping the factory so parallel agents share one entrypoint.
 */
export function createBrowserEngine(_options?: BrowserLaunchOptions): BrowserEngine {
  const notReady = (method: string): never => {
    throw new Error(
      `@scenelock/browser: ${method} not implemented yet (Playwright wrap pending)`,
    );
  };

  const engine: BrowserEngine = {
    async launch() {
      return notReady("launch");
    },
    async newSession(_ctx: ExecutorContext, _opts?: BrowserLaunchOptions): Promise<BrowserSession> {
      return notReady("newSession");
    },
    async close() {
      /* no-op until launch exists */
    },
  };
  return engine;
}

/** Headers required for SAB / cross-origin isolation (Creator integration tier). */
export const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
} as const;
