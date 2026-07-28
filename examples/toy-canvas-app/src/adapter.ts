import type { RasterSurface, SceneAdapter, SceneNode, StepLoopDriver } from "@scenelock/core";
import { defineSceneAdapter } from "@scenelock/scene";
import { createStepLoopDriver, type StepLoopController } from "@scenelock/executor";
import type { ToyCanvasApp } from "./app.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Adoption story: adapter in one file surface. */
export function createToySceneAdapter(app: ToyCanvasApp): SceneAdapter {
  return defineSceneAdapter({
    snapshot(): SceneNode[] {
      return app.list().map((n) => ({
        id: n.id,
        role: n.kind,
        name: n.name,
        bbox: { x: n.x, y: n.y, width: n.width, height: n.height },
        state: {
          fill: n.fill,
          selected: app.model.selected === n.id,
        },
      }));
    },
    locate(id: string) {
      return app.bboxOf(id);
    },
    async settled() {
      // Polls host settledness. Pair with awaitSettled({ step }) to pump tweens.
      while (!app.isSettled()) {
        await delay(0);
      }
    },
  });
}

export function createToyStepLoop(
  app: ToyCanvasApp,
  options?: { fixedDtMs?: number },
): StepLoopController {
  return createStepLoopDriver(
    {
      step(deltaMs: number) {
        app.step(deltaMs);
      },
      async settled() {
        /* sync host — use adapter.settled / awaitSettled for tween waits */
      },
    },
    { fixedDtMs: options?.fixedDtMs ?? 16 },
  );
}

/** Bare StepLoopDriver without fixed-dt helpers (still valid core). */
export function createToyStepLoopBare(app: ToyCanvasApp): StepLoopDriver {
  return {
    step(deltaMs: number) {
      app.step(deltaMs);
    },
    async settled() {
      /* sync */
    },
  };
}

export function createToyRasterSurface(app: ToyCanvasApp): RasterSurface {
  return {
    render: () => app.render(),
  };
}
