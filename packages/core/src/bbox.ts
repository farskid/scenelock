/** Axis-aligned bounding box in CSS pixels (origin top-left). */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function bboxCenter(b: BBox): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function bboxContains(b: BBox, x: number, y: number): boolean {
  return x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height;
}
