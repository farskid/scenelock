/**
 * Every deterministic run is a seed. Failures carry the seed as a replay token.
 * Schedule fuzzing varies seeds; it does not tolerate flake.
 */

export type SeedInput = string | number | bigint;

export interface Seed {
  /** Canonical string form used in failure envelopes and CLI flags. */
  readonly value: string;
  /** Numeric materialization for PRNGs (stable hash of value). */
  readonly numeric: number;
}

export interface SeededRandom {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform int in [min, max). */
  int(min: number, max: number): number;
  /** Deterministic shuffle (Fisher–Yates over this stream). */
  shuffle<T>(items: readonly T[]): T[];
}

export interface SeedManager {
  /** Create or parse a seed. When omitted, generate a fresh printable seed. */
  create(input?: SeedInput): Seed;
  /** Derive a child seed for a named sub-run (walk id, fuzz iteration). */
  derive(parent: Seed, label: string): Seed;
  /** Build a seeded PRNG bound to this seed. */
  random(seed: Seed): SeededRandom;
}
