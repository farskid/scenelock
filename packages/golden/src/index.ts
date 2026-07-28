import type {
  GoldenCompare,
  GoldenCompareOptions,
  GoldenDiff,
  GoldenStore,
  RasterFrame,
} from "@scenelock/core";

/**
 * @scenelock/golden — bit-exact RGBA comparison.
 *
 * ## Pinned rasterizer assumptions
 * - Prefer a **software** rasterizer (e.g. ThorVG SW, Cairo, or host `render()→RGBA`).
 * - Do **not** claim cross-machine bit-exact goldens from GPU/compositor paths.
 * - Font/text determinism is **not** promised until the host pins fonts + hinting
 *   (open item on the project map). Shape/geometry goldens without text are OK.
 * - Engine-tier goldens run in Node+WASM; browser blit/compositing is a separate claim.
 * - Tolerance-based / perceptual diffs are out of scope.
 */

export type { GoldenCompare, GoldenCompareOptions, GoldenDiff, GoldenStore, RasterFrame };

export const RASTERIZER_ASSUMPTIONS = {
  softwareOnly: true,
  crossMachineBitExact: "engine-tier-only-when-fonts-pinned",
  tolerance: "none",
  browserCompositor: "not-a-golden-source",
} as const;

export function framesEqual(a: RasterFrame, b: RasterFrame): GoldenDiff {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      verdict: "dimension-mismatch",
      expected: { width: b.width, height: b.height },
      actual: { width: a.width, height: a.height },
    };
  }
  const n = a.pixels.length;
  if (n !== b.pixels.length) {
    return { verdict: "mismatch", diffByteCount: Math.abs(n - b.pixels.length) };
  }
  let first = -1;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (a.pixels[i] !== b.pixels[i]) {
      if (first < 0) first = i;
      count++;
    }
  }
  if (count === 0) return { verdict: "match" };
  return {
    verdict: "mismatch",
    firstDiffByte: first,
    diffByteCount: count,
    expected: { width: b.width, height: b.height },
    actual: { width: a.width, height: a.height },
  };
}

export function createMemoryGoldenStore(initial: Record<string, RasterFrame> = {}): GoldenStore {
  const map = new Map(Object.entries(initial));
  return {
    async read(name) {
      return map.get(name) ?? null;
    },
    async write(name, frame) {
      map.set(name, frame);
    },
  };
}

export function createGoldenCompare(store: GoldenStore): GoldenCompare {
  return {
    async compare(name, actual, options: GoldenCompareOptions = {}): Promise<GoldenDiff> {
      const key = options.suite ? `${options.suite}/${name}` : name;
      const expected = await store.read(key);
      if (!expected) {
        if (options.update) {
          await store.write(key, actual);
          return { verdict: "missing-baseline" };
        }
        return { verdict: "missing-baseline" };
      }
      return framesEqual(actual, expected);
    },
  };
}
