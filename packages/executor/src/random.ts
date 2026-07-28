import type { Seed, SeededRandom } from "@scenelock/core";

/**
 * Mulberry32 PRNG bound to {@link Seed.numeric}.
 * Deterministic across runs/processes for the same seed.
 */
export function createSeededRandom(seed: Seed): SeededRandom {
  let state = seed.numeric >>> 0;

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
        throw new Error("SeededRandom.int: min and max must be integers");
      }
      if (max <= min) {
        throw new Error("SeededRandom.int: max must be > min");
      }
      const span = max - min;
      return min + Math.floor(next() * span);
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i]!;
        out[i] = out[j]!;
        out[j] = tmp;
      }
      return out;
    },
  };
}
