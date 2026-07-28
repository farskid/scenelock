import type { Seed, SeedInput, SeedManager } from "@scenelock/core";
import { defaultSeedManager } from "./seed.js";

/**
 * Schedule-fuzz stub: derive `n` child seeds from `base` for exploration.
 * Unit-test only surface — no host required. Same `(base, n)` → same list.
 */
export function exploreSeeds(
  base: SeedInput,
  n: number,
  seeds: SeedManager = defaultSeedManager,
): Seed[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("exploreSeeds: n must be a non-negative integer");
  }
  const parent = seeds.create(base);
  const out: Seed[] = [];
  for (let i = 0; i < n; i++) {
    out.push(seeds.derive(parent, `fuzz-${i}`));
  }
  return out;
}
