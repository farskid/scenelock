import type { RasterSurface } from "@scenelock/core";

/** Normalized RGBA frame from {@link RasterSurface.render}. */
export interface RasterFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/**
 * Thin helper: invoke a {@link RasterSurface} and normalize to a Promise.
 * No image I/O — goldens live in `@scenelock/golden`.
 */
export async function renderRasterSurface(surface: RasterSurface): Promise<RasterFrame> {
  return Promise.resolve(surface.render());
}

/**
 * Wrap a sync/async render function as a {@link RasterSurface}.
 */
export function defineRasterSurface(
  render: () => RasterFrame | Promise<RasterFrame>,
): RasterSurface {
  return { render };
}
