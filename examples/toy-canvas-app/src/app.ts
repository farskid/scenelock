import type { BBox } from "@scenelock/core";
import { EditorModel, type Shape, type ShapeKind, type Rgba } from "./model.js";
import { renderShapes, type RasterResult } from "./raster.js";

interface Tween {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startMs: number;
  durationMs: number;
}

/**
 * Headless-friendly retained-model drawing host.
 * Owns editor ops + a step(dt) animation loop (shape tweens) for settledness.
 */
export class ToyCanvasApp {
  readonly model = new EditorModel();
  private tweens = new Map<string, Tween>();
  private timeMs = 0;
  private frame = 0;
  private dirty = false;

  get currentTime(): number {
    return this.timeMs;
  }

  get frameIndex(): number {
    return this.frame;
  }

  get isAnimating(): boolean {
    return this.tweens.size > 0;
  }

  add(
    kind: ShapeKind,
    opts: {
      name?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: Rgba;
      id?: string;
    },
  ): Shape {
    const shape = this.model.add(kind, opts);
    this.dirty = true;
    return shape;
  }

  move(id: string, x: number, y: number): void {
    this.model.move(id, x, y);
    this.dirty = true;
  }

  select(id: string | null): void {
    this.model.select(id);
    this.dirty = true;
  }

  deleteSelected(): void {
    const id = this.model.selected;
    if (id) this.tweens.delete(id);
    this.model.deleteSelected();
    this.dirty = true;
  }

  undo(): void {
    this.model.undo();
    this.dirty = true;
  }

  redo(): void {
    this.model.redo();
    this.dirty = true;
  }

  /**
   * Animate shape `id` to (toX, toY) over `durationMs` of virtual step time.
   * Settled when all tweens complete.
   */
  tweenTo(id: string, toX: number, toY: number, durationMs = 100): void {
    const s = this.model.get(id);
    if (!s) throw new Error(`unknown shape ${id}`);
    this.tweens.set(id, {
      id,
      fromX: s.x,
      fromY: s.y,
      toX,
      toY,
      startMs: this.timeMs,
      durationMs: Math.max(1, durationMs),
    });
    this.dirty = true;
  }

  /** Explicit time step — no rAF. Advances tweens; commits final positions. */
  step(deltaMs: number): void {
    this.timeMs += deltaMs;
    this.frame += 1;

    const done: string[] = [];
    for (const tween of this.tweens.values()) {
      const t = Math.min(1, (this.timeMs - tween.startMs) / tween.durationMs);
      const x = tween.fromX + (tween.toX - tween.fromX) * t;
      const y = tween.fromY + (tween.toY - tween.fromY) * t;
      this.model.setPosition(tween.id, x, y);
      if (t >= 1) done.push(tween.id);
    }
    for (const id of done) {
      const tween = this.tweens.get(id)!;
      this.tweens.delete(id);
      this.model.setPosition(id, tween.toX, tween.toY);
    }
    this.dirty = this.tweens.size > 0;
  }

  list(): Shape[] {
    return this.model.list();
  }

  bboxOf(id: string): BBox | null {
    const n = this.model.get(id);
    if (!n) return null;
    return { x: n.x, y: n.y, width: n.width, height: n.height };
  }

  render(width = 64, height = 64): RasterResult {
    return renderShapes(this.model.list(), width, height);
  }

  /** True when queues drained and no active tweens. */
  isSettled(): boolean {
    return !this.dirty && this.tweens.size === 0;
  }
}
