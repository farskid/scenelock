import { randomBytes } from "node:crypto";
import type { Seed, SeedInput, SeedManager, SeededRandom } from "@scenelock/core";
import { hashSeed } from "./hash.js";
import { createSeededRandom } from "./random.js";

/**
 * Create or parse a {@link Seed}. When `input` is omitted, generates a fresh
 * printable hex seed (non-deterministic by design — record it for replay).
 */
export function createSeed(input?: SeedInput): Seed {
  const value =
    input === undefined ? randomBytes(8).toString("hex") : String(input);
  return { value, numeric: hashSeed(value) };
}

/**
 * Derive a stable child seed for a named sub-stream (walk id, fuzz iteration).
 * Identical `(parent, label)` always yields the same child across machines.
 */
export function deriveSeed(parent: Seed, label: string): Seed {
  if (label.length === 0) {
    throw new Error("SeedManager.derive: label must be non-empty");
  }
  // NUL separator avoids ambiguity between parent="a", label="b:c" vs parent="a:b", label="c".
  return createSeed(`${parent.value}\0${label}`);
}

/** Default {@link SeedManager} implementation for the executor package. */
export function createSeedManager(): SeedManager {
  return {
    create: createSeed,
    derive: deriveSeed,
    random(seed: Seed): SeededRandom {
      return createSeededRandom(seed);
    },
  };
}

/** Shared default manager used when {@link ExecutorOptions.seeds} is omitted. */
export const defaultSeedManager: SeedManager = createSeedManager();
