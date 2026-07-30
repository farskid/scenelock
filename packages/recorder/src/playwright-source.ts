import type { DomLocator } from "@scenelock/core";
import type { DomElementInfo, DomResolver, RawInputEvent } from "./types.js";
import type { RecordEventSource } from "./event-source.js";
import { RECORDER_BINDING, type PageRecorderEvent } from "./browser-source.js";

/**
 * Playwright-backed recorder event source.
 *
 * Uses `exposeBinding(__scenelockRecorderPush)` + `addInitScript` so page-realm
 * pointer/key/input listeners can marshal into Node. Structured like
 * `playwright-driver.ts`: type-only page surface, no static `playwright` import.
 */

/** Minimal Playwright Page surface used by the binding source + DOM resolver. */
export interface PlaywrightRecorderPage {
  exposeBinding(
    name: string,
    callback: (source: { page: PlaywrightRecorderPage }, ...args: unknown[]) => unknown,
  ): Promise<void>;
  addInitScript<Arg>(script: (arg: Arg) => void, arg: Arg): Promise<void>;
  evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): {
    count(): Promise<number>;
  };
  getByLabel(text: string | RegExp, options?: { exact?: boolean }): { count(): Promise<number> };
  getByText(text: string | RegExp, options?: { exact?: boolean }): { count(): Promise<number> };
  getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): {
    count(): Promise<number>;
  };
  getByAltText(text: string | RegExp, options?: { exact?: boolean }): { count(): Promise<number> };
  getByTestId(testId: string): { count(): Promise<number> };
}

export interface PlaywrightRecorderEventSourceOptions {
  /** Detect pointer targets under `<canvas>` as canvas surface. Default true. */
  readonly detectCanvas?: boolean;
}

type InstallArg = { readonly binding: string; readonly detectCanvas: boolean };

/**
 * Page-realm installer — must stay serializable for `addInitScript` / `evaluate`.
 * Calls the Playwright-exposed binding by name.
 */
function installRecorderPageListeners(arg: InstallArg): void {
  const w = globalThis as typeof globalThis & {
    __scenelockRecorderInstalled?: boolean;
    __scenelockRecorderCleanup?: () => void;
  };
  if (w.__scenelockRecorderInstalled) return;
  w.__scenelockRecorderInstalled = true;

  const push = (globalThis as unknown as Record<string, unknown>)[arg.binding] as
    | ((e: PageRecorderEvent) => void | Promise<void>)
    | undefined;

  type Mod = "Alt" | "Control" | "Meta" | "Shift";

  const modsFrom = (ev: {
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  }): Mod[] | undefined => {
    const out: Mod[] = [];
    if (ev.altKey) out.push("Alt");
    if (ev.ctrlKey) out.push("Control");
    if (ev.metaKey) out.push("Meta");
    if (ev.shiftKey) out.push("Shift");
    return out.length > 0 ? out : undefined;
  };

  const surfaceOf = (target: unknown): "dom" | "canvas" | "auto" => {
    if (!arg.detectCanvas || target === null || typeof target !== "object") {
      return "auto";
    }
    const el = target as {
      closest?: (sel: string) => unknown;
      tagName?: string;
    };
    if (typeof el.closest === "function") {
      return el.closest("canvas") !== null ? "canvas" : "dom";
    }
    if (typeof el.tagName === "string" && el.tagName.toLowerCase() === "canvas") {
      return "canvas";
    }
    return "dom";
  };

  type DomLikeEvent = {
    clientX?: number;
    clientY?: number;
    button?: number;
    buttons?: number;
    timeStamp: number;
    target?: unknown;
    key?: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  };

  type DomLikeDocument = {
    addEventListener(
      type: string,
      listener: (ev: DomLikeEvent) => void,
      options?: boolean,
    ): void;
    removeEventListener(
      type: string,
      listener: (ev: DomLikeEvent) => void,
      options?: boolean,
    ): void;
  };

  const onPointerDown = (ev: DomLikeEvent) => {
    const m = modsFrom(ev);
    push?.({
      type: "pointerdown",
      x: ev.clientX ?? 0,
      y: ev.clientY ?? 0,
      button: ev.button ?? 0,
      timestamp: ev.timeStamp,
      surface: surfaceOf(ev.target ?? null),
      ...(m !== undefined ? { modifiers: m } : {}),
    });
  };
  const onPointerUp = (ev: DomLikeEvent) => {
    const m = modsFrom(ev);
    push?.({
      type: "pointerup",
      x: ev.clientX ?? 0,
      y: ev.clientY ?? 0,
      button: ev.button ?? 0,
      timestamp: ev.timeStamp,
      surface: surfaceOf(ev.target ?? null),
      ...(m !== undefined ? { modifiers: m } : {}),
    });
  };
  const onPointerMove = (ev: DomLikeEvent) => {
    const m = modsFrom(ev);
    push?.({
      type: "pointermove",
      x: ev.clientX ?? 0,
      y: ev.clientY ?? 0,
      buttons: ev.buttons ?? 0,
      timestamp: ev.timeStamp,
      surface: surfaceOf(ev.target ?? null),
      ...(m !== undefined ? { modifiers: m } : {}),
    });
  };
  const onKey = (type: "keydown" | "keyup") => (ev: DomLikeEvent) => {
    const m = modsFrom(ev);
    push?.({
      type,
      key: ev.key ?? "",
      timestamp: ev.timeStamp,
      ...(m !== undefined ? { modifiers: m } : {}),
    });
  };
  const onInput = (ev: DomLikeEvent) => {
    const t = ev.target as { value?: unknown } | null | undefined;
    const text = t !== null && t !== undefined && "value" in t ? String(t.value ?? "") : "";
    push?.({
      type: "input",
      text,
      timestamp: ev.timeStamp,
      surface: surfaceOf(t ?? null),
    });
  };

  const kd = onKey("keydown");
  const ku = onKey("keyup");
  const doc = (globalThis as unknown as { document?: DomLikeDocument }).document;
  if (doc !== undefined) {
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointerup", onPointerUp, true);
    doc.addEventListener("pointermove", onPointerMove, true);
    doc.addEventListener("keydown", kd, true);
    doc.addEventListener("keyup", ku, true);
    doc.addEventListener("input", onInput, true);
    w.__scenelockRecorderCleanup = () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointerup", onPointerUp, true);
      doc.removeEventListener("pointermove", onPointerMove, true);
      doc.removeEventListener("keydown", kd, true);
      doc.removeEventListener("keyup", ku, true);
      doc.removeEventListener("input", onInput, true);
      w.__scenelockRecorderInstalled = false;
    };
  }
}

function toRaw(e: PageRecorderEvent): RawInputEvent {
  switch (e.type) {
    case "pointerdown":
      return {
        type: "pointerdown",
        x: e.x,
        y: e.y,
        timestamp: e.timestamp,
        ...(e.button !== undefined ? { button: e.button } : {}),
        ...(e.modifiers !== undefined ? { modifiers: e.modifiers } : {}),
        ...(e.surface !== undefined ? { surface: e.surface } : {}),
      };
    case "pointerup":
      return {
        type: "pointerup",
        x: e.x,
        y: e.y,
        timestamp: e.timestamp,
        ...(e.button !== undefined ? { button: e.button } : {}),
        ...(e.modifiers !== undefined ? { modifiers: e.modifiers } : {}),
        ...(e.surface !== undefined ? { surface: e.surface } : {}),
      };
    case "pointermove":
      return {
        type: "pointermove",
        x: e.x,
        y: e.y,
        timestamp: e.timestamp,
        ...(e.buttons !== undefined ? { buttons: e.buttons } : {}),
        ...(e.modifiers !== undefined ? { modifiers: e.modifiers } : {}),
        ...(e.surface !== undefined ? { surface: e.surface } : {}),
      };
    case "keydown":
      return {
        type: "keydown",
        key: e.key,
        timestamp: e.timestamp,
        ...(e.modifiers !== undefined ? { modifiers: e.modifiers } : {}),
      };
    case "keyup":
      return {
        type: "keyup",
        key: e.key,
        timestamp: e.timestamp,
        ...(e.modifiers !== undefined ? { modifiers: e.modifiers } : {}),
      };
    case "input":
      return {
        type: "input",
        text: e.text,
        timestamp: e.timestamp,
        ...(e.modifiers !== undefined ? { modifiers: e.modifiers } : {}),
        ...(e.surface !== undefined ? { surface: e.surface } : {}),
        ...(e.x !== undefined ? { x: e.x } : {}),
        ...(e.y !== undefined ? { y: e.y } : {}),
      };
    default: {
      const _e: never = e;
      throw new Error(`Unknown page recorder event: ${JSON.stringify(_e)}`);
    }
  }
}

/**
 * Real-Chromium event source: Playwright `exposeBinding` + `addInitScript`.
 * Call {@link createPlaywrightRecorderEventSource} before `goto` so the init
 * script installs on navigation; `start` also evaluates install for an
 * already-loaded document.
 */
export function createPlaywrightRecorderEventSource(
  page: PlaywrightRecorderPage,
  options: PlaywrightRecorderEventSourceOptions = {},
): RecordEventSource {
  const detectCanvas = options.detectCanvas !== false;
  let active = false;
  let onEvent: ((event: RawInputEvent) => void | Promise<void>) | null = null;
  const pending: Promise<void>[] = [];
  let bindingExposed = false;

  return {
    async start(handler) {
      if (active) {
        throw new Error("PlaywrightRecorderEventSource: already started");
      }
      active = true;
      onEvent = handler;

      if (!bindingExposed) {
        await page.exposeBinding(RECORDER_BINDING, (_source, ...args: unknown[]) => {
          const e = args[0] as PageRecorderEvent;
          if (onEvent === null) return;
          const p = Promise.resolve(onEvent(toRaw(e)));
          pending.push(p);
          void p.finally(() => {
            const idx = pending.indexOf(p);
            if (idx >= 0) pending.splice(idx, 1);
          });
        });
        bindingExposed = true;
      }

      const installArg: InstallArg = { binding: RECORDER_BINDING, detectCanvas };
      await page.addInitScript(installRecorderPageListeners, installArg);
      // Cover pages already navigated before start().
      await page.evaluate(installRecorderPageListeners, installArg);
    },

    async stop() {
      await Promise.all(pending);
      pending.length = 0;
      active = false;
      onEvent = null;
      try {
        await page.evaluate(() => {
          const w = globalThis as typeof globalThis & {
            __scenelockRecorderCleanup?: () => void;
            __scenelockRecorderInstalled?: boolean;
          };
          w.__scenelockRecorderCleanup?.();
          w.__scenelockRecorderInstalled = false;
        }, undefined as void);
      } catch {
        /* page may already be closed */
      }
    },
  };
}

/**
 * Playwright-backed {@link DomResolver} for record-time a11y ladder resolution.
 * `atPoint` uses `elementFromPoint` + light implicit-role / name heuristics.
 */
export function createPlaywrightDomResolver(page: PlaywrightRecorderPage): DomResolver {
  return {
    async atPoint(x: number, y: number): Promise<DomElementInfo | null> {
      return page.evaluate(
        (pt) => {
          type DomEl = {
            tagName: string;
            id: string;
            textContent: string | null;
            getAttribute(name: string): string | null;
            closest(sel: string): DomEl | null;
            getBoundingClientRect(): {
              x: number;
              y: number;
              width: number;
              height: number;
            };
          };
          type DomDoc = {
            elementFromPoint(x: number, y: number): DomEl | null;
            querySelector(sel: string): DomEl | null;
          };
          const doc = (globalThis as unknown as { document?: DomDoc }).document;
          if (doc === undefined) return null;
          const el = doc.elementFromPoint(pt.x, pt.y);
          if (el === null) return null;

          const tag = el.tagName.toLowerCase();
          let role = el.getAttribute("role") ?? undefined;
          if (role === undefined) {
            if (tag === "button") role = "button";
            else if (tag === "a") role = "link";
            else if (tag === "input") {
              const type = (el.getAttribute("type") ?? "text").toLowerCase();
              role = type === "checkbox" || type === "radio" ? type : "textbox";
            } else if (tag === "textarea") role = "textbox";
            else if (tag === "img") role = "img";
          }

          const ariaLabel = el.getAttribute("aria-label") ?? undefined;
          let name = ariaLabel;
          if (name === undefined && (role === "button" || role === "link")) {
            name = (el.textContent ?? "").trim() || undefined;
          }
          if (name === undefined && role === "img") {
            name = el.getAttribute("alt") ?? undefined;
          }

          let label: string | undefined;
          if (el.id.length > 0) {
            const escaped = el.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            const lab = doc.querySelector(`label[for="${escaped}"]`);
            if (lab !== null) label = (lab.textContent ?? "").trim() || undefined;
          }
          if (label === undefined) {
            const wrap = el.closest("label");
            if (wrap !== null) label = (wrap.textContent ?? "").trim() || undefined;
          }
          if (name === undefined && label !== undefined) name = label;

          const placeholder = el.getAttribute("placeholder") ?? undefined;
          const alt = el.getAttribute("alt") ?? undefined;
          const testId = el.getAttribute("data-testid") ?? undefined;
          const rect = el.getBoundingClientRect();

          return {
            ...(role !== undefined ? { role } : {}),
            ...(name !== undefined && name.length > 0 ? { name } : {}),
            ...(label !== undefined && label.length > 0 ? { label } : {}),
            ...(placeholder !== undefined && placeholder.length > 0 ? { placeholder } : {}),
            ...(alt !== undefined && alt.length > 0 ? { alt } : {}),
            ...(testId !== undefined && testId.length > 0 ? { testId } : {}),
            bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        },
        { x, y },
      );
    },

    async count(locator: DomLocator): Promise<number> {
      switch (locator.kind) {
        case "role": {
          const opts: { name?: string | RegExp; exact?: boolean } = {};
          if (locator.name !== undefined) opts.name = locator.name;
          if (locator.exact !== undefined) opts.exact = locator.exact;
          return page.getByRole(locator.role, opts).count();
        }
        case "label": {
          const opts = locator.exact !== undefined ? { exact: locator.exact } : undefined;
          return page.getByLabel(locator.label, opts).count();
        }
        case "text": {
          const opts = locator.exact !== undefined ? { exact: locator.exact } : undefined;
          return page.getByText(locator.text, opts).count();
        }
        case "placeholder": {
          const opts = locator.exact !== undefined ? { exact: locator.exact } : undefined;
          return page.getByPlaceholder(locator.placeholder, opts).count();
        }
        case "alt": {
          const opts = locator.exact !== undefined ? { exact: locator.exact } : undefined;
          return page.getByAltText(locator.alt, opts).count();
        }
        case "testId":
          return page.getByTestId(locator.testId).count();
        default: {
          const _e: never = locator;
          throw new Error(`Unsupported DomLocator: ${JSON.stringify(_e)}`);
        }
      }
    },
  };
}
