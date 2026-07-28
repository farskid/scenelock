import type { Seed } from "@scenelock/core";
import {
  fromDeclarativeModel,
  type DeclarativeStateModel,
} from "../model.js";
import type { WalkExecutor } from "../runner.js";
import type { ModelEvent } from "@scenelock/core";

/**
 * Toy 5-state model:
 *   idle ──START──► ready ──DRAW──► drawing ──STOP──► ready
 *                     │                │
 *                   SAVE             CANCEL
 *                     ▼                ▼
 *                   saved ◄──SAVE── drawing
 *                     │
 *                   RESET
 *                     ▼
 *                   idle
 *
 * Also: ready ──IDLE──► idle (shortcut)
 */
export const TOY_5: DeclarativeStateModel = {
  id: "toy5",
  initial: "idle",
  states: ["idle", "ready", "drawing", "saved", "error"],
  transitions: [
    { from: "idle", event: "START", to: "ready" },
    { from: "ready", event: "DRAW", to: "drawing" },
    { from: "ready", event: "IDLE", to: "idle" },
    { from: "drawing", event: "STOP", to: "ready" },
    { from: "drawing", event: "CANCEL", to: "ready" },
    { from: "drawing", event: "SAVE", to: "saved" },
    { from: "saved", event: "RESET", to: "idle" },
    { from: "ready", event: "FAIL", to: "error" },
    { from: "error", event: "RESET", to: "idle" },
  ],
};

export function toy5Model() {
  return fromDeclarativeModel(TOY_5);
}

export const seedA: Seed = { value: "seed-a", numeric: 0x12345678 };
export const seedB: Seed = { value: "seed-b", numeric: 0x90abcdef };

/** In-memory walk executor over a counter + state label snapshot. */
export function createMemoryExecutor(options?: {
  /** Fail invariant path: mutate snapshot in a non-idempotent way for SAVE. */
  breakIdempotentSave?: boolean;
  /** Force snapshot drift after N steps. */
  breakAfterStep?: number;
}): WalkExecutor & {
  history: unknown[];
  committed: { state: string; n: number };
} {
  let committed = { state: "idle", n: 0 };
  const history: unknown[] = [];
  let steps = 0;

  const clone = () => ({ ...committed });

  const applyOne = (event: ModelEvent, stateLabel: string): void => {
    if (event.type === "SAVE" && options?.breakIdempotentSave) {
      committed = { state: stateLabel, n: committed.n + 1 };
      return;
    }
    committed = { state: stateLabel, n: committed.n + (event.type === "DRAW" ? 1 : 0) };
  };

  return {
    history,
    get committed() {
      return committed;
    },
    begin(_walk, initial) {
      committed = { state: String(initial.value), n: 0 };
      const snap = clone();
      history.push(snap);
      return { snapshot: snap };
    },
    applyEvent(event, state) {
      steps++;
      applyOne(event, String(state.value));
      if (options?.breakAfterStep !== undefined && steps >= options.breakAfterStep) {
        committed = { ...committed, n: committed.n + 1000 };
      }
      const snap = clone();
      history.push(snap);
      return { snapshot: snap };
    },
    probe(events) {
      const saved = clone();
      let label = committed.state;
      let n = committed.n;
      for (const event of events) {
        // Speculative: mirror toy5 transition labels loosely via event-only heuristics
        // for combinator tests; real hosts fork their store.
        if (event.type === "SAVE" && options?.breakIdempotentSave) {
          n += 1;
        } else if (event.type === "DRAW") {
          n += 1;
          label = "drawing";
        } else if (event.type === "UNDO_DRAW") {
          n = Math.max(0, n - 1);
        } else if (event.type === "START") {
          label = "ready";
        } else if (event.type === "RESET") {
          label = "idle";
          n = 0;
        }
      }
      void label;
      // Restore committed — probe must not stick.
      committed = saved;
      return { state: label, n };
    },
  };
}
