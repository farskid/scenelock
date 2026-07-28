import type { DeclarativeStateModel, ModelEvent, ModelState, Walk } from "@scenelock/core";
import {
  fail,
  fromDeclarativeModel,
  jsonStableEqual,
  ok,
  type SnapshotContext,
  type SnapshotInvariant,
  type WalkExecutor,
} from "@scenelock/discovery";
import type { ToyCanvasApp } from "./app.js";

/**
 * Declarative state model of the toy editor:
 *   idle ──ADD──► idle
 *   idle ──SELECT──► selected
 *   selected ──DELETE──► idle
 *   selected ──UNDO──► idle
 *   idle ──UNDO──► idle
 *   selected ──REDO──► selected
 *   idle ──REDO──► idle
 */
export const TOY_EDITOR_MODEL: DeclarativeStateModel = {
  id: "toy-editor",
  initial: "idle",
  states: ["idle", "selected"],
  transitions: [
    { from: "idle", event: "ADD", to: "idle" },
    { from: "idle", event: "SELECT", to: "selected" },
    { from: "selected", event: "DELETE", to: "idle" },
    { from: "selected", event: "UNDO", to: "idle" },
    { from: "idle", event: "UNDO", to: "idle" },
    { from: "selected", event: "REDO", to: "selected" },
    { from: "idle", event: "REDO", to: "idle" },
  ],
};

export function toyEditorStateModel() {
  return fromDeclarativeModel(TOY_EDITOR_MODEL);
}

/**
 * Undo/redo identity over the real editor: when the stack allows it,
 * `UNDO`∘`REDO` and `REDO`∘`UNDO` restore the current stable snapshot.
 */
export function toyUndoRedoIdentity(): SnapshotInvariant {
  return {
    name: "undoRedoIdentity",
    async check(ctx) {
      if (!ctx.probe) {
        return fail("undoRedoIdentity requires WalkExecutor.probe");
      }
      const canUndo = Boolean(ctx.meta?.canUndo);
      const canRedo = Boolean(ctx.meta?.canRedo);
      if (canUndo) {
        const after = await ctx.probe([{ type: "UNDO" }, { type: "REDO" }]);
        if (!jsonStableEqual(ctx.snapshot, after)) {
          return fail("undo+redo did not restore snapshot");
        }
      }
      if (canRedo) {
        const after = await ctx.probe([{ type: "REDO" }, { type: "UNDO" }]);
        if (!jsonStableEqual(ctx.snapshot, after)) {
          return fail("redo+undo did not restore snapshot");
        }
      }
      return ok();
    },
  };
}

/**
 * WalkExecutor bound to a real {@link ToyCanvasApp}.
 * Applies model events as editor ops; probe forks via forkState restore.
 */
export function createToyWalkExecutor(app: ToyCanvasApp): WalkExecutor {
  const snapCtx = (): SnapshotContext => {
    const s = app.model.snapshot();
    return {
      snapshot: app.model.stableSnapshot(),
      meta: { canUndo: s.canUndo, canRedo: s.canRedo },
    };
  };

  const applyOne = (event: ModelEvent): void => {
    switch (event.type) {
      case "ADD": {
        const n = app.list().length;
        app.add("rect", {
          name: `R${n + 1}`,
          x: 4 + n * 2,
          y: 4 + n * 2,
          width: 10,
          height: 10,
          fill: [200, 40, 40, 255],
        });
        break;
      }
      case "SELECT": {
        if (app.list().length === 0) {
          app.add("rect", {
            name: "R1",
            x: 8,
            y: 8,
            width: 12,
            height: 12,
          });
        }
        app.select(app.list()[0]!.id);
        break;
      }
      case "DELETE": {
        if (app.model.selected === null && app.list().length > 0) {
          app.select(app.list()[0]!.id);
        }
        if (app.model.selected !== null) {
          app.deleteSelected();
        }
        break;
      }
      case "UNDO": {
        if (app.model.snapshot().canUndo) app.undo();
        break;
      }
      case "REDO": {
        if (app.model.snapshot().canRedo) app.redo();
        break;
      }
      default:
        throw new Error(`unsupported discovery event ${event.type}`);
    }
  };

  return {
    begin(_walk: Walk, _initial: ModelState) {
      return snapCtx();
    },
    applyEvent(event) {
      applyOne(event);
      return snapCtx();
    },
    probe(events) {
      const saved = app.model.forkState();
      for (const event of events) {
        applyOne(event);
      }
      const after = app.model.stableSnapshot();
      app.model.restoreFork(saved);
      return after;
    },
  };
}
