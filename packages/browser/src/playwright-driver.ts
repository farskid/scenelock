import type { BBox } from "@scenelock/core";
import type {
  DriverFillOptions,
  DriverLocator,
  DriverTarget,
  DriverTypeOptions,
  PageDriver,
} from "./driver.js";
import { isDriverPoint } from "./driver.js";

/**
 * Playwright-backed {@link PageDriver}.
 *
 * Types are local (no `import` from `playwright`) so unit tests and `tsc`
 * succeed without the dependency installed. The runtime load is a guarded
 * dynamic import — install `playwright` before calling {@link launchPlaywrightDriver}.
 */

/** Minimal structural types — mirrors the Playwright surface we use. */
interface PWLocator {
  click(): Promise<void>;
  dblclick(): Promise<void>;
  hover(): Promise<void>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
  type(text: string, options?: { delay?: number }): Promise<void>;
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  isVisible(): Promise<boolean>;
  isHidden(): Promise<boolean>;
  textContent(): Promise<string | null>;
  inputValue(): Promise<string>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

interface PWPage {
  goto(url: string): Promise<unknown>;
  mouse: {
    click(x: number, y: number): Promise<void>;
    dblclick(x: number, y: number): Promise<void>;
    move(x: number, y: number): Promise<void>;
  };
  keyboard: { press(key: string): Promise<void> };
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): PWLocator;
  getByLabel(text: string | RegExp, options?: { exact?: boolean }): PWLocator;
  getByText(text: string | RegExp, options?: { exact?: boolean }): PWLocator;
  getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): PWLocator;
  getByAltText(text: string | RegExp, options?: { exact?: boolean }): PWLocator;
  getByTestId(testId: string): PWLocator;
  locator(selector: string): PWLocator;
  evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  screenshot(options?: { path?: string }): Promise<Uint8Array>;
  close(): Promise<void>;
}

interface PWBrowserContext {
  newPage(): Promise<PWPage>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  close(): Promise<void>;
}

interface PWBrowser {
  newContext(options?: { extraHTTPHeaders?: Record<string, string> }): Promise<PWBrowserContext>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: {
    launch(options?: { headless?: boolean; channel?: string }): Promise<PWBrowser>;
  };
}

export interface PlaywrightDriverOptions {
  readonly headless?: boolean;
  readonly channel?: "chromium" | "firefox" | "webkit";
  readonly extraHTTPHeaders?: Readonly<Record<string, string>>;
}

export interface PlaywrightDriverHandle {
  readonly driver: PageDriver;
  readonly browser: PWBrowser;
  readonly context: PWBrowserContext;
  readonly page: PWPage;
  close(): Promise<void>;
}

/**
 * Dynamically import playwright without a static module binding.
 * Keeps typecheck/tests green when the package is absent.
 */
export async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    // Native dynamic import works under Vitest/Node. The Function fallback
    // avoids some bundlers rewriting `import()`; Vitest's VM rejects it.
    try {
      return (await import("playwright")) as PlaywrightModule;
    } catch {
      const importer = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
      return (await importer("playwright")) as PlaywrightModule;
    }
  } catch (cause) {
    throw new Error(
      "@scenelock/browser: playwright is not installed. Add it as a dependency " +
        "to use createBrowserEngine(), or inject FakePageDriver / PageDriver in tests.",
      { cause },
    );
  }
}

/** Launch Chromium + context + page, wrapped as a {@link PageDriver}. */
export async function launchPlaywrightDriver(
  options: PlaywrightDriverOptions = {},
): Promise<PlaywrightDriverHandle> {
  const pw = await loadPlaywright();
  const headless = options.headless !== false;
  const launchOpts: { headless: boolean; channel?: string } = { headless };
  if (options.channel !== undefined && options.channel !== "chromium") {
    launchOpts.channel = options.channel;
  }
  const browser = await pw.chromium.launch(launchOpts);
  const contextOpts =
    options.extraHTTPHeaders !== undefined
      ? { extraHTTPHeaders: { ...options.extraHTTPHeaders } }
      : undefined;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const driver = new PlaywrightPageDriver(page, context);

  return {
    driver,
    browser,
    context,
    page,
    async close() {
      await page.close();
      await context.close();
      await browser.close();
    },
  };
}

/** Wrap an existing Playwright page as a {@link PageDriver}. */
export function wrapPlaywrightPage(page: PWPage, context?: PWBrowserContext): PageDriver {
  return new PlaywrightPageDriver(page, context);
}

class PlaywrightPageDriver implements PageDriver {
  constructor(
    private readonly page: PWPage,
    private readonly context: PWBrowserContext | undefined,
  ) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async click(target: DriverTarget): Promise<void> {
    if (isDriverPoint(target)) {
      await this.page.mouse.click(target.x, target.y);
      return;
    }
    await this.toLocator(target).click();
  }

  async dblclick(target: DriverTarget): Promise<void> {
    if (isDriverPoint(target)) {
      await this.page.mouse.dblclick(target.x, target.y);
      return;
    }
    await this.toLocator(target).dblclick();
  }

  async hover(target: DriverTarget): Promise<void> {
    if (isDriverPoint(target)) {
      await this.page.mouse.move(target.x, target.y);
      return;
    }
    await this.toLocator(target).hover();
  }

  async fill(target: DriverLocator, value: string, options?: DriverFillOptions): Promise<void> {
    const loc = this.toLocator(target);
    if (options?.clear !== false) {
      try {
        await loc.clear();
      } catch {
        /* some roles have no clear — fill overwrites */
      }
    }
    await loc.fill(value);
  }

  async type(target: DriverLocator, text: string, options?: DriverTypeOptions): Promise<void> {
    const loc = this.toLocator(target);
    if (options?.clear === true) {
      try {
        await loc.clear();
      } catch {
        /* ignore */
      }
    }
    const typeOpts = options?.delayMs !== undefined ? { delay: options.delayMs } : undefined;
    await loc.type(text, typeOpts);
  }

  async press(target: DriverLocator | "page", key: string): Promise<void> {
    if (target === "page") {
      await this.page.keyboard.press(key);
      return;
    }
    await this.toLocator(target).press(key);
  }

  async evaluate<T, Arg = void>(fn: (arg: Arg) => T | Promise<T>, arg?: Arg): Promise<T> {
    return this.page.evaluate(fn, arg as Arg);
  }

  async screenshot(path: string): Promise<string> {
    await this.page.screenshot({ path });
    return path;
  }

  async bbox(target: DriverLocator): Promise<BBox | null> {
    return this.toLocator(target).boundingBox();
  }

  async isVisible(target: DriverLocator): Promise<boolean> {
    return this.toLocator(target).isVisible();
  }

  async isHidden(target: DriverLocator): Promise<boolean> {
    return this.toLocator(target).isHidden();
  }

  async textContent(target: DriverLocator): Promise<string | null> {
    return this.toLocator(target).textContent();
  }

  async inputValue(target: DriverLocator): Promise<string | null> {
    try {
      return await this.toLocator(target).inputValue();
    } catch {
      return null;
    }
  }

  async count(target: DriverLocator): Promise<number> {
    return this.toLocator(target).count();
  }

  async setExtraHTTPHeaders(headers: Readonly<Record<string, string>>): Promise<void> {
    if (this.context === undefined) {
      throw new Error("PlaywrightPageDriver: setExtraHTTPHeaders requires a BrowserContext");
    }
    await this.context.setExtraHTTPHeaders({ ...headers });
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  private toLocator(target: DriverLocator): PWLocator {
    switch (target.kind) {
      case "role": {
        const opts: { name?: string | RegExp; exact?: boolean } = {};
        if (target.name !== undefined) opts.name = target.name;
        if (target.exact !== undefined) opts.exact = target.exact;
        return this.page.getByRole(target.role, opts);
      }
      case "label": {
        const opts = target.exact !== undefined ? { exact: target.exact } : undefined;
        return this.page.getByLabel(target.label, opts);
      }
      case "text": {
        const opts = target.exact !== undefined ? { exact: target.exact } : undefined;
        return this.page.getByText(target.text, opts);
      }
      case "placeholder": {
        const opts = target.exact !== undefined ? { exact: target.exact } : undefined;
        return this.page.getByPlaceholder(target.placeholder, opts);
      }
      case "alt": {
        const opts = target.exact !== undefined ? { exact: target.exact } : undefined;
        return this.page.getByAltText(target.alt, opts);
      }
      case "testId":
        return this.page.getByTestId(target.testId);
      case "css":
        return this.page.locator(target.css);
      case "xpath":
        return this.page.locator(`xpath=${target.xpath}`);
      default: {
        const _e: never = target;
        throw new Error(`Unsupported driver locator: ${JSON.stringify(_e)}`);
      }
    }
  }
}
