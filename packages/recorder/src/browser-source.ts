import type { PageDriver } from "@scenelock/browser";
import type { RawInputEvent } from "./types.js";
import type { RecordEventSource } from "./event-source.js";

/**
 * Binding name installed in the page realm for event marshalling.
 * Kept stable so FakePageDriver evaluate probes and Playwright agree.
 */
export const RECORDER_BINDING = "__scenelockRecorderPush";

/** Serialized event shape posted from the page init script. */
export type PageRecorderEvent =
  | {
      readonly type: "pointerdown" | "pointerup";
      readonly x: number;
      readonly y: number;
      readonly button?: number;
      readonly modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift">;
      readonly timestamp: number;
      readonly surface?: "dom" | "canvas" | "auto";
    }
  | {
      readonly type: "pointermove";
      readonly x: number;
      readonly y: number;
      readonly buttons?: number;
      readonly modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift">;
      readonly timestamp: number;
      readonly surface?: "dom" | "canvas" | "auto";
    }
  | {
      readonly type: "keydown" | "keyup";
      readonly key: string;
      readonly modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift">;
      readonly timestamp: number;
    }
  | {
      readonly type: "input";
      readonly text: string;
      readonly modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift">;
      readonly timestamp: number;
      readonly surface?: "dom" | "canvas" | "auto";
      readonly x?: number;
      readonly y?: number;
    };

export interface PageDriverEventSourceOptions {
  /**
   * When true, treat pointer events over `<canvas>` as canvas surface.
   * Default true.
   */
  readonly detectCanvas?: boolean;
}

/**
 * Install page listeners via {@link PageDriver.evaluate} and forward to the recorder.
 *
 * Structured like `playwright-driver.ts`: type-only imports from browser package,
 * no Playwright runtime import. Works with FakePageDriver (in-process evaluate)
 * and real Playwright pages (evaluate runs in the page realm).
 */
export function createPageDriverEventSource(
  driver: PageDriver,
  options: PageDriverEventSourceOptions = {},
): RecordEventSource {
  const detectCanvas = options.detectCanvas !== false;
  let active = false;
  let onEvent: ((event: RawInputEvent) => void | Promise<void>) | null = null;
  const pending: Promise<void>[] = [];

  const toRaw = (e: PageRecorderEvent): RawInputEvent => {
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
  };

  return {
    async start(handler) {
      if (active) {
        throw new Error("PageDriverEventSource: already started");
      }
      active = true;
      onEvent = handler;

      // Stash the push callback on the host realm (FakePageDriver evaluate shares Node
      // globalThis). Real Chromium uses createPlaywrightRecorderEventSource (exposeBinding).
      const g = globalThis as typeof globalThis & {
        [RECORDER_BINDING]?: (e: PageRecorderEvent) => void;
      };
      g[RECORDER_BINDING] = (e: PageRecorderEvent) => {
        if (onEvent !== null) {
          const p = Promise.resolve(onEvent(toRaw(e)));
          pending.push(p);
          void p.finally(() => {
            const idx = pending.indexOf(p);
            if (idx >= 0) pending.splice(idx, 1);
          });
        }
      };

      await driver.evaluate(
        (arg: { binding: string; detectCanvas: boolean }) => {
          const w = globalThis as typeof globalThis & {
            __scenelockRecorderInstalled?: boolean;
            __scenelockRecorderCleanup?: () => void;
          };
          if (w.__scenelockRecorderInstalled) return;
          w.__scenelockRecorderInstalled = true;

          const push = (globalThis as unknown as Record<string, unknown>)[arg.binding] as
            | ((e: PageRecorderEvent) => void)
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
            const payload: PageRecorderEvent = {
              type: "pointerdown",
              x: ev.clientX ?? 0,
              y: ev.clientY ?? 0,
              button: ev.button ?? 0,
              timestamp: ev.timeStamp,
              surface: surfaceOf(ev.target ?? null),
              ...(m !== undefined ? { modifiers: m } : {}),
            };
            push?.(payload);
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
            const text =
              t !== null && t !== undefined && "value" in t ? String(t.value ?? "") : "";
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
        },
        { binding: RECORDER_BINDING, detectCanvas },
      );
    },

    async stop() {
      await Promise.all(pending);
      pending.length = 0;
      active = false;
      onEvent = null;
      try {
        await driver.evaluate(() => {
          const w = globalThis as typeof globalThis & {
            __scenelockRecorderCleanup?: () => void;
            __scenelockRecorderInstalled?: boolean;
          };
          w.__scenelockRecorderCleanup?.();
          w.__scenelockRecorderInstalled = false;
        });
      } catch {
        /* driver may already be closed in tests */
      }
      const g = globalThis as typeof globalThis & {
        [RECORDER_BINDING]?: (e: PageRecorderEvent) => void;
      };
      delete g[RECORDER_BINDING];
    },
  };
}

/**
 * Test helper: push a page event through the binding installed by
 * {@link createPageDriverEventSource} (FakePageDriver / Node realm).
 */
export function pushPageRecorderEvent(event: PageRecorderEvent): void {
  const g = globalThis as typeof globalThis & {
    [RECORDER_BINDING]?: (e: PageRecorderEvent) => void;
  };
  const push = g[RECORDER_BINDING];
  if (push === undefined) {
    throw new Error(
      `pushPageRecorderEvent: binding ${RECORDER_BINDING} not installed — start the event source first`,
    );
  }
  push(event);
}
