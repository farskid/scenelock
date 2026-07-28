import type { BBox, RasterSurface, SceneAdapter, SceneNode, StepLoopDriver } from "@scenelock/core";
import { defineSceneAdapter } from "@scenelock/scene";

/**
 * Toy retained-model canvas host.
 * Demonstrates the adoption story: one adapter file exposing snapshot/locate/settled
 * plus a step-driven loop for the deterministic executor.
 */

export interface ToyNode {
  id: string;
  role: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: [number, number, number, number];
}

export class ToyCanvasApp {
  private nodes = new Map<string, ToyNode>();
  private dirty = false;
  private frame = 0;
  private timeMs = 0;

  add(node: ToyNode): void {
    this.nodes.set(node.id, node);
    this.dirty = true;
  }

  move(id: string, x: number, y: number): void {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`unknown node ${id}`);
    n.x = x;
    n.y = y;
    this.dirty = true;
  }

  /** Explicit time step — no rAF. */
  step(deltaMs: number): void {
    this.timeMs += deltaMs;
    this.frame += 1;
    this.dirty = false;
  }

  get currentTime(): number {
    return this.timeMs;
  }

  get frameIndex(): number {
    return this.frame;
  }

  list(): ToyNode[] {
    return [...this.nodes.values()];
  }

  bboxOf(id: string): BBox | null {
    const n = this.nodes.get(id);
    if (!n) return null;
    return { x: n.x, y: n.y, width: n.width, height: n.height };
  }

  /** Software "raster": flat fill per node, later wins. 64×64 RGBA. */
  render(width = 64, height = 64): { width: number; height: number; pixels: Uint8ClampedArray } {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (const n of this.nodes.values()) {
      const x0 = Math.max(0, Math.floor(n.x));
      const y0 = Math.max(0, Math.floor(n.y));
      const x1 = Math.min(width, Math.ceil(n.x + n.width));
      const y1 = Math.min(height, Math.ceil(n.y + n.height));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          pixels[i] = n.fill[0]!;
          pixels[i + 1] = n.fill[1]!;
          pixels[i + 2] = n.fill[2]!;
          pixels[i + 3] = n.fill[3]!;
        }
      }
    }
    return { width, height, pixels };
  }
}

/** Adoption story: adapter in one file. */
export function createToySceneAdapter(app: ToyCanvasApp): SceneAdapter {
  return defineSceneAdapter({
    snapshot(): SceneNode[] {
      return app.list().map((n) => ({
        id: n.id,
        role: n.role,
        name: n.name,
        bbox: { x: n.x, y: n.y, width: n.width, height: n.height },
        state: { fill: n.fill },
      }));
    },
    locate(id: string) {
      return app.bboxOf(id);
    },
    async settled() {
      /* toy is sync; real hosts wait for queue drain + frame commit */
    },
  });
}

export function createToyStepLoop(app: ToyCanvasApp): StepLoopDriver {
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
