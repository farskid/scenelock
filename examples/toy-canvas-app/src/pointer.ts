import { bboxContains } from "@scenelock/core";
import type { PointerSink } from "@scenelock/harness";
import type { ToyCanvasApp } from "./app.js";

/**
 * Scene-tier pointer sink: hit-test retained shapes and select the topmost hit.
 * Used when createHarness has an adapter but no PageDriver.
 */
export function createToyPointerSink(app: ToyCanvasApp): PointerSink {
  const click = (x: number, y: number): void => {
    const shapes = app.list();
    // Topmost = last in paint order.
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]!;
      if (bboxContains({ x: s.x, y: s.y, width: s.width, height: s.height }, x, y)) {
        app.select(s.id);
        return;
      }
    }
    app.select(null);
  };

  return {
    click,
    drag(from, to) {
      click(from.x, from.y);
      const id = app.model.selected;
      if (id) {
        const s = app.model.get(id);
        if (s) {
          app.move(id, s.x + (to.x - from.x), s.y + (to.y - from.y));
        }
      }
    },
  };
}
