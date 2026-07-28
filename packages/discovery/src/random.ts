/**
 * Self-contained mulberry32 PRNG for deterministic walk generation.
 * Do not import from `@scenelock/executor` — sibling package, not a dependency.
 */

export interface Mulberry32 {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform int in [min, max). */
  int(min: number, max: number): number;
}

/** Create a mulberry32 stream from an unsigned 32-bit seed. */
export function mulberry32(seedNumeric: number): Mulberry32 {
  let state = seedNumeric >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new Error("mulberry32.int: min and max must be integers");
      }
      if (max <= min) {
        throw new Error("mulberry32.int: max must be > min");
      }
      return min + Math.floor(next() * (max - min));
    },
  };
}

/** FNV-1a 32-bit — stable string → u32 for child seeds. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
