import type { ExecutionTier } from "@scenelock/core";
import { resolvePointTarget } from "./resolve.js";
import {
  appendAction,
  cloneSession,
  createEmptySession,
} from "./session.js";
import type {
  CreateRecorderOptions,
  ModifierKey,
  RawInputEvent,
  RecordedAction,
  RecordedTarget,
  Recorder,
  RecordingSession,
} from "./types.js";

const DEFAULT_DRAG_THRESHOLD = 4;
const DEFAULT_DBLCLICK_WINDOW_MS = 300;

/** Keys that always emit as `press` (never coalesced into `type`). */
const PRESS_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

interface PointerGesture {
  down: { x: number; y: number; timestamp: number; modifiers?: readonly ModifierKey[]; surface?: "dom" | "canvas" | "auto" };
  moved: boolean;
  last: { x: number; y: number };
  maxDistance: number;
}

interface PendingType {
  target: RecordedTarget;
  text: string;
  timestamp: number;
  modifiers?: readonly ModifierKey[];
}

interface PendingClick {
  target: RecordedTarget;
  timestamp: number;
  modifiers?: readonly ModifierKey[];
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function targetsEqual(a: RecordedTarget, b: RecordedTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Pure recorder: feed low-level input events, get a semantic {@link RecordingSession}.
 * No browser dependency — event source is pluggable.
 */
export function createRecorder(options: CreateRecorderOptions = {}): Recorder {
  let tier: ExecutionTier = options.tier ?? "scene";
  let seed = options.seed;
  let title = options.title;
  let adapter = options.adapter;
  let domResolver = options.domResolver;
  let dragThresholdPx = options.dragThresholdPx ?? DEFAULT_DRAG_THRESHOLD;
  let dblclickWindowMs = options.dblclickWindowMs ?? DEFAULT_DBLCLICK_WINDOW_MS;

  let session = createEmptySession({
    tier,
    ...(seed !== undefined ? { seed } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(adapter !== undefined
      ? { adapterContractVersion: adapter.contractVersion }
      : {}),
  });

  let gesture: PointerGesture | null = null;
  let pendingType: PendingType | null = null;
  let pendingClick: PendingClick | null = null;
  /** Last resolved pointer target — used as focus for coalesced `type`. */
  let lastTarget: RecordedTarget | null = null;

  const push = (action: RecordedAction): void => {
    session = appendAction(session, action);
  };

  const flushType = (): void => {
    if (pendingType === null) return;
    const action: RecordedAction = {
      kind: "type",
      target: pendingType.target,
      text: pendingType.text,
      timestamp: pendingType.timestamp,
      ...(pendingType.modifiers !== undefined ? { modifiers: pendingType.modifiers } : {}),
    };
    push(action);
    pendingType = null;
  };

  const flushPendingClickAsClick = (): void => {
    if (pendingClick === null) return;
    lastTarget = pendingClick.target;
    push({
      kind: "click",
      target: pendingClick.target,
      timestamp: pendingClick.timestamp,
      ...(pendingClick.modifiers !== undefined ? { modifiers: pendingClick.modifiers } : {}),
    });
    pendingClick = null;
  };

  const resolve = async (
    x: number,
    y: number,
    surface?: "dom" | "canvas" | "auto",
  ): Promise<RecordedTarget> =>
    resolvePointTarget(
      { x, y },
      {
        ...(adapter !== undefined ? { adapter } : {}),
        ...(domResolver !== undefined ? { domResolver } : {}),
        ...(surface !== undefined ? { surface } : {}),
      },
    );

  const api: Recorder = {
    async feed(event: RawInputEvent): Promise<void> {
      switch (event.type) {
        case "pointerdown": {
          flushType();
          gesture = {
            down: {
              x: event.x,
              y: event.y,
              timestamp: event.timestamp,
              ...(event.modifiers !== undefined ? { modifiers: event.modifiers } : {}),
              ...(event.surface !== undefined ? { surface: event.surface } : {}),
            },
            moved: false,
            last: { x: event.x, y: event.y },
            maxDistance: 0,
          };
          return;
        }
        case "pointermove": {
          if (gesture === null) return;
          gesture.last = { x: event.x, y: event.y };
          const d = distance(gesture.down, gesture.last);
          if (d > gesture.maxDistance) gesture.maxDistance = d;
          if (d >= dragThresholdPx) gesture.moved = true;
          return;
        }
        case "pointerup": {
          flushType();
          if (gesture === null) return;
          const g = gesture;
          gesture = null;
          const surface = g.down.surface ?? event.surface;
          const fromTarget = await resolve(g.down.x, g.down.y, surface);
          const toTarget = await resolve(event.x, event.y, surface);

          if (g.moved || g.maxDistance >= dragThresholdPx) {
            flushPendingClickAsClick();
            lastTarget = toTarget;
            push({
              kind: "drag",
              from: fromTarget,
              to: toTarget,
              timestamp: g.down.timestamp,
              ...(g.down.modifiers !== undefined ? { modifiers: g.down.modifiers } : {}),
            });
            return;
          }

          // Click / dblclick coalescing
          if (
            pendingClick !== null &&
            event.timestamp - pendingClick.timestamp <= dblclickWindowMs &&
            targetsEqual(pendingClick.target, fromTarget)
          ) {
            lastTarget = fromTarget;
            push({
              kind: "dblclick",
              target: fromTarget,
              timestamp: pendingClick.timestamp,
              ...(pendingClick.modifiers !== undefined
                ? { modifiers: pendingClick.modifiers }
                : {}),
            });
            pendingClick = null;
            return;
          }

          flushPendingClickAsClick();
          pendingClick = {
            target: fromTarget,
            timestamp: g.down.timestamp,
            ...(g.down.modifiers !== undefined ? { modifiers: g.down.modifiers } : {}),
          };
          return;
        }
        case "keydown": {
          if (PRESS_KEYS.has(event.key) || event.key.length > 1) {
            flushType();
            flushPendingClickAsClick();
            push({
              kind: "press",
              key: event.key,
              timestamp: event.timestamp,
              ...(event.modifiers !== undefined ? { modifiers: event.modifiers } : {}),
            });
            return;
          }
          // Printable → coalesce into type (target = last click / pending click)
          const focusTarget =
            pendingClick?.target ?? lastTarget ?? pendingType?.target ?? null;
          flushPendingClickAsClick();
          const target: RecordedTarget =
            focusTarget ??
            ({
              kind: "point",
              x: 0,
              y: 0,
              reason: "no-dom-match",
              flagged: true,
            } as const);
          lastTarget = target;
          if (pendingType === null) {
            pendingType = {
              target,
              text: event.key,
              timestamp: event.timestamp,
              ...(event.modifiers !== undefined ? { modifiers: event.modifiers } : {}),
            };
          } else {
            pendingType = {
              ...pendingType,
              text: pendingType.text + event.key,
            };
          }
          return;
        }
        case "keyup":
          return;
        case "input": {
          flushPendingClickAsClick();
          let target: RecordedTarget;
          if (event.x !== undefined && event.y !== undefined) {
            target = await resolve(event.x, event.y, event.surface);
          } else if (pendingType !== null) {
            target = pendingType.target;
          } else {
            target = {
              kind: "point",
              x: 0,
              y: 0,
              reason: "no-dom-match",
              flagged: true,
            };
          }
          if (pendingType === null) {
            pendingType = {
              target,
              text: event.text,
              timestamp: event.timestamp,
              ...(event.modifiers !== undefined ? { modifiers: event.modifiers } : {}),
            };
          } else if (targetsEqual(pendingType.target, target)) {
            pendingType = {
              ...pendingType,
              text: pendingType.text + event.text,
            };
          } else {
            flushType();
            pendingType = {
              target,
              text: event.text,
              timestamp: event.timestamp,
              ...(event.modifiers !== undefined ? { modifiers: event.modifiers } : {}),
            };
          }
          return;
        }
        default: {
          const _e: never = event;
          throw new Error(`Unknown raw input event: ${JSON.stringify(_e)}`);
        }
      }
    },

    checkpoint(name: string): void {
      flushType();
      flushPendingClickAsClick();
      const lastTs =
        session.actions.length > 0
          ? session.actions[session.actions.length - 1]!.timestamp
          : 0;
      push({
        kind: "checkpoint",
        name,
        timestamp: lastTs,
      });
    },

    async flush(): Promise<void> {
      flushType();
      flushPendingClickAsClick();
      if (adapter !== undefined) {
        session = {
          version: session.version,
          metadata: {
            ...session.metadata,
            adapterContractVersion: adapter.contractVersion,
          },
          actions: session.actions,
        };
      }
    },

    session(): RecordingSession {
      return cloneSession(session);
    },

    reset(next?: Partial<CreateRecorderOptions>): void {
      if (next?.tier !== undefined) tier = next.tier;
      if (next?.seed !== undefined) seed = next.seed;
      if (next?.title !== undefined) title = next.title;
      if (next?.adapter !== undefined) adapter = next.adapter;
      if (next?.domResolver !== undefined) domResolver = next.domResolver;
      if (next?.dragThresholdPx !== undefined) dragThresholdPx = next.dragThresholdPx;
      if (next?.dblclickWindowMs !== undefined) dblclickWindowMs = next.dblclickWindowMs;
      gesture = null;
      pendingType = null;
      pendingClick = null;
      lastTarget = null;
      session = createEmptySession({
        tier,
        ...(seed !== undefined ? { seed } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(adapter !== undefined
          ? { adapterContractVersion: adapter.contractVersion }
          : {}),
      });
    },
  };

  return api;
}
