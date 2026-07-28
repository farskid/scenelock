import type {
  BrowserEngine,
  BrowserLaunchOptions,
  BrowserSession,
  ExecutorContext,
} from "@scenelock/core";
import { CROSS_ORIGIN_ISOLATION_HEADERS } from "./headers.js";
import { loadPlaywright, wrapPlaywrightPage } from "./playwright-driver.js";
import { DriverBrowserSession } from "./session.js";

/**
 * Playwright-backed {@link BrowserEngine}.
 * Headless defaults to true; headed is opt-in via `headless: false`.
 *
 * Pattern: one browser per engine (after `launch` or first `newSession`);
 * each `newSession` gets a fresh context + page for isolation.
 */

interface OwnedBrowser {
  close(): Promise<void>;
  newContext(options?: { extraHTTPHeaders?: Record<string, string> }): Promise<{
    newPage(): Promise<Parameters<typeof wrapPlaywrightPage>[0]>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface CreateBrowserEngineOptions extends BrowserLaunchOptions {
  /** Extra HTTP headers applied to every new session context. */
  readonly extraHTTPHeaders?: Readonly<Record<string, string>>;
}

export function createBrowserEngine(options: CreateBrowserEngineOptions = {}): BrowserEngine {
  let browser: OwnedBrowser | undefined;
  const engineOptions = options;

  async function ensureBrowser(launch: CreateBrowserEngineOptions): Promise<OwnedBrowser> {
    if (browser !== undefined) return browser;
    const pw = await loadPlaywright();
    const headless = launch.headless !== false;
    const launchOpts: { headless: boolean; channel?: string } = { headless };
    if (launch.channel !== undefined && launch.channel !== "chromium") {
      launchOpts.channel = launch.channel;
    }
    browser = (await pw.chromium.launch(launchOpts)) as OwnedBrowser;
    return browser;
  }

  const engine: BrowserEngine = {
    async launch(launchOptions?: BrowserLaunchOptions): Promise<BrowserEngine> {
      const merged = mergeLaunch(engineOptions, launchOptions);
      if (browser !== undefined) {
        await browser.close();
        browser = undefined;
      }
      await ensureBrowser(merged);
      return engine;
    },

    async newSession(
      ctx: ExecutorContext,
      sessionOptions?: BrowserLaunchOptions,
    ): Promise<BrowserSession> {
      const merged = mergeLaunch(engineOptions, sessionOptions);
      const b = await ensureBrowser(merged);
      const headerBag = headersFor(merged);
      const context = await b.newContext(
        headerBag !== undefined ? { extraHTTPHeaders: { ...headerBag } } : undefined,
      );
      const page = await context.newPage();
      const driver = wrapPlaywrightPage(page, context);

      const session = await DriverBrowserSession.create({
        driver,
        ctx,
        launch: merged,
      });

      return {
        ctx: session.ctx,
        harness: () => session.harness(),
        goto: (url) => session.goto(url),
        bindScene: (adapter) => session.bindScene(adapter),
        close: async () => {
          await session.close();
          await context.close();
        },
      };
    },

    async close(): Promise<void> {
      if (browser !== undefined) {
        await browser.close();
        browser = undefined;
      }
    },
  };

  return engine;
}

function mergeLaunch(
  base: CreateBrowserEngineOptions,
  override?: BrowserLaunchOptions,
): CreateBrowserEngineOptions {
  return {
    ...base,
    ...override,
    headless: override?.headless ?? base.headless ?? true,
  };
}

function headersFor(
  options: CreateBrowserEngineOptions,
): Readonly<Record<string, string>> | undefined {
  const headers: Record<string, string> = { ...(options.extraHTTPHeaders ?? {}) };
  if (options.crossOriginIsolated === true) {
    Object.assign(headers, CROSS_ORIGIN_ISOLATION_HEADERS);
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}
