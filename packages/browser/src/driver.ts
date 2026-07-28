import type { BBox } from "@scenelock/core";

/**
 * Internal thin seam over a browser page.
 * Real Chromium is Playwright; unit tests inject {@link FakePageDriver}.
 */

/** CSS-pixel point for coordinate-aimed interactions (scene locators). */
export interface DriverPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Engine-agnostic locator target after core → driver translation.
 * Structural targets are only produced when policy allows them.
 */
export type DriverLocator =
  | { readonly kind: "role"; readonly role: string; readonly name?: string | RegExp; readonly exact?: boolean }
  | { readonly kind: "label"; readonly label: string | RegExp; readonly exact?: boolean }
  | { readonly kind: "text"; readonly text: string | RegExp; readonly exact?: boolean }
  | { readonly kind: "placeholder"; readonly placeholder: string | RegExp; readonly exact?: boolean }
  | { readonly kind: "alt"; readonly alt: string | RegExp; readonly exact?: boolean }
  | { readonly kind: "testId"; readonly testId: string }
  | { readonly kind: "css"; readonly css: string }
  | { readonly kind: "xpath"; readonly xpath: string };

/** Click / hover / fill target: resolved locator or absolute coordinates. */
export type DriverTarget = DriverLocator | DriverPoint;

export function isDriverPoint(target: DriverTarget): target is DriverPoint {
  return "x" in target && "y" in target && !("kind" in target);
}

export interface DriverFillOptions {
  readonly clear?: boolean;
}

export interface DriverTypeOptions {
  readonly delayMs?: number;
  readonly clear?: boolean;
}

/**
 * Minimal page surface used by BrowserSession / Harness.
 * Deliberately omits sleep APIs (`waitForTimeout`) — callers poll conditions.
 */
export interface PageDriver {
  goto(url: string): Promise<void>;
  click(target: DriverTarget): Promise<void>;
  dblclick(target: DriverTarget): Promise<void>;
  hover(target: DriverTarget): Promise<void>;
  fill(target: DriverLocator, value: string, options?: DriverFillOptions): Promise<void>;
  type(target: DriverLocator, text: string, options?: DriverTypeOptions): Promise<void>;
  press(target: DriverLocator | "page", key: string): Promise<void>;
  /**
   * Run a function in the page realm (or fake equivalent).
   * Used for scene-adapter bridges and COOP/COEP probes.
   * `arg` is cloned into the page (Playwright semantics); fakes invoke in-process.
   */
  evaluate<T, Arg = void>(fn: (arg: Arg) => T | Promise<T>, arg?: Arg): Promise<T>;
  /** Write a screenshot to `path`; returns the same path pointer (never a blob). */
  screenshot(path: string): Promise<string>;
  bbox(target: DriverLocator): Promise<BBox | null>;
  isVisible(target: DriverLocator): Promise<boolean>;
  isHidden(target: DriverLocator): Promise<boolean>;
  textContent(target: DriverLocator): Promise<string | null>;
  inputValue(target: DriverLocator): Promise<string | null>;
  count(target: DriverLocator): Promise<number>;
  /** Extra HTTP headers for subsequent navigations (COOP/COEP fixture support). */
  setExtraHTTPHeaders(headers: Readonly<Record<string, string>>): Promise<void>;
  close(): Promise<void>;
}
