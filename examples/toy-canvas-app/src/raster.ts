import type { Shape } from "./model.js";

/**
 * Pure-TS software raster — no deps.
 * Fill rects (AABB) and ellipses (filled) into RGBA Uint8ClampedArray.
 */

export const TOY_RASTER_FINGERPRINT = "toy-raster-v1";

export interface RasterResult {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  fill: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  if (i < 0 || i + 3 >= pixels.length) return;
  pixels[i] = fill[0]!;
  pixels[i + 1] = fill[1]!;
  pixels[i + 2] = fill[2]!;
  pixels[i + 3] = fill[3]!;
}

function fillRect(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  shape: Shape,
): void {
  const x0 = Math.max(0, Math.floor(shape.x));
  const y0 = Math.max(0, Math.floor(shape.y));
  const x1 = Math.min(width, Math.ceil(shape.x + shape.width));
  const y1 = Math.min(height, Math.ceil(shape.y + shape.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPixel(pixels, width, x, y, shape.fill);
    }
  }
}

function fillEllipse(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  shape: Shape,
): void {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const rx = shape.width / 2;
  const ry = shape.height / 2;
  if (rx <= 0 || ry <= 0) return;

  const x0 = Math.max(0, Math.floor(shape.x));
  const y0 = Math.max(0, Math.floor(shape.y));
  const x1 = Math.min(width, Math.ceil(shape.x + shape.width));
  const y1 = Math.min(height, Math.ceil(shape.y + shape.height));
  const rx2 = rx * rx;
  const ry2 = ry * ry;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) {
        setPixel(pixels, width, x, y, shape.fill);
      }
    }
  }
}

/** Render shapes in list order (later wins). Background is transparent black. */
export function renderShapes(
  shapes: readonly Shape[],
  width = 64,
  height = 64,
): RasterResult {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const shape of shapes) {
    if (shape.kind === "rect") {
      fillRect(pixels, width, height, shape);
    } else {
      fillEllipse(pixels, width, height, shape);
    }
  }
  return { width, height, pixels };
}
