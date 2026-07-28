/**
 * @scenelock/browser — Playwright-wrapped browser tier.
 *
 * Wraps the `playwright` library (not `@playwright/test` as the product surface).
 * Locator policy: role → label/text → testId; structural CSS denied by default.
 * Unit tests inject {@link FakePageDriver}; Chromium loads only via dynamic import.
 */

export type {
  BrowserEngine,
  BrowserLaunchOptions,
  BrowserSession,
  LocatorBridge,
} from "@scenelock/core";
export { DEFAULT_LOCATOR_PRIORITY } from "@scenelock/core";

export type {
  DriverFillOptions,
  DriverLocator,
  DriverPoint,
  DriverTarget,
  DriverTypeOptions,
  PageDriver,
} from "./driver.js";
export { isDriverPoint } from "./driver.js";

export {
  StructuralLocatorDeniedError,
  assertLocatorAllowed,
  translateLocator,
  createLocatorTranslator,
  type StructuralLocatorLike,
} from "./locators.js";

export { AutoWaitTimeoutError, pollUntil, type PollOptions } from "./auto-wait.js";

export {
  BrowserActionError,
  buildBrowserFailure,
  isFailureEnvelopeShape,
  type BuildFailureOptions,
} from "./failure.js";

export {
  CROSS_ORIGIN_ISOLATION_HEADERS,
  applyCrossOriginIsolationHeaders,
  assertCrossOriginIsolated,
  type CrossOriginIsolationHeaders,
} from "./headers.js";

export {
  FakePageDriver,
  type FakeElement,
  type FakePageDriverOptions,
} from "./fake-driver.js";

export {
  loadPlaywright,
  launchPlaywrightDriver,
  wrapPlaywrightPage,
  type PlaywrightDriverOptions,
  type PlaywrightDriverHandle,
} from "./playwright-driver.js";

export {
  BrowserHarness,
  type BrowserHarnessOptions,
} from "./harness.js";

export {
  DriverBrowserSession,
  createBrowserSession,
  type BrowserSessionOptions,
} from "./session.js";

export {
  createBrowserEngine,
  type CreateBrowserEngineOptions,
} from "./engine.js";

export {
  createPageSceneAdapter,
  DEFAULT_PAGE_SCENE_GLOBAL,
  type PageSceneBridgeOptions,
} from "./scene-bridge.js";
