import type {
  BrowserLaunchOptions,
  BrowserSession,
  ExecutorContext,
  Harness,
  Locator,
  LocatorBridge,
  SceneAdapter,
} from "@scenelock/core";
import type { PageDriver } from "./driver.js";
import { BrowserHarness, type BrowserHarnessOptions } from "./harness.js";
import {
  applyCrossOriginIsolationHeaders,
  CROSS_ORIGIN_ISOLATION_HEADERS,
} from "./headers.js";
import { assertLocatorAllowed, translateLocator } from "./locators.js";
import { createPageSceneAdapter } from "./scene-bridge.js";

/**
 * {@link BrowserSession} over an injected {@link PageDriver}.
 */

export interface BrowserSessionOptions {
  readonly driver: PageDriver;
  readonly ctx: ExecutorContext;
  readonly launch?: BrowserLaunchOptions;
  /** Extra HTTP headers (merged with COOP/COEP when crossOriginIsolated is set). */
  readonly extraHTTPHeaders?: Readonly<Record<string, string>>;
  readonly harness?: Omit<BrowserHarnessOptions, "driver" | "ctx">;
  /**
   * When true, bind a page-global scene adapter via evaluate
   * (`__scenelockScene`) instead of a Node-side adapter.
   */
  readonly bindPageScene?: boolean;
}

export class DriverBrowserSession implements BrowserSession {
  readonly ctx: ExecutorContext;
  private readonly driver: PageDriver;
  private readonly harnessImpl: BrowserHarness;
  private closed = false;

  private constructor(
    ctx: ExecutorContext,
    driver: PageDriver,
    harness: BrowserHarness,
  ) {
    this.ctx = ctx;
    this.driver = driver;
    this.harnessImpl = harness;
  }

  /** Construct and apply launch-time header hints (COOP/COEP). */
  static async create(options: BrowserSessionOptions): Promise<DriverBrowserSession> {
    const headers: Record<string, string> = {
      ...(options.extraHTTPHeaders ?? {}),
    };
    if (options.launch?.crossOriginIsolated === true) {
      Object.assign(headers, CROSS_ORIGIN_ISOLATION_HEADERS);
    }
    if (Object.keys(headers).length > 0) {
      await options.driver.setExtraHTTPHeaders(headers);
    }

    const harness = new BrowserHarness({
      driver: options.driver,
      ctx: options.ctx,
      ...(options.harness ?? {}),
    });

    if (options.bindPageScene === true) {
      harness.bindScene(createPageSceneAdapter(options.driver));
    }

    return new DriverBrowserSession(options.ctx, options.driver, harness);
  }

  harness(): Harness {
    return this.harnessImpl;
  }

  async goto(url: string): Promise<void> {
    this.ensureOpen();
    await this.driver.goto(url);
    await this.harnessImpl.settled();
  }

  bindScene(adapter: SceneAdapter): void {
    this.harnessImpl.bindScene(adapter);
  }

  /**
   * Bind the page-exposed scene adapter (`window.__scenelockScene` by default).
   * Convenience over {@link createPageSceneAdapter} + {@link bindScene}.
   */
  bindPageScene(): void {
    this.harnessImpl.bindScene(createPageSceneAdapter(this.driver));
  }

  /** Locator bridge enforcing a11y-primary policy. */
  locatorBridge(): LocatorBridge {
    return {
      resolve: (locator: Locator) => {
        assertLocatorAllowed(locator);
        return this.harnessImpl.locate(locator);
      },
    };
  }

  /** Expose driver for advanced helpers (COOP assert, custom evaluate). */
  getDriver(): PageDriver {
    return this.driver;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.driver.close();
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error("BrowserSession: already closed");
  }
}

/**
 * Create a session from an injected driver (unit tests / custom engines).
 */
export async function createBrowserSession(
  options: BrowserSessionOptions,
): Promise<DriverBrowserSession> {
  return DriverBrowserSession.create(options);
}

/** Re-export translate for LocatorBridge consumers. */
export { translateLocator, applyCrossOriginIsolationHeaders };
