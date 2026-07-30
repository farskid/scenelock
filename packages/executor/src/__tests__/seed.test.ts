import { describe, expect, it } from "vitest";
import {
  createSeed,
  createSeedManager,
  createSeededRandom,
  deriveSeed,
  hashSeed,
} from "../index.js";

describe("SeededRandom / SeedManager", () => {
  it("same seed → identical next() sequences across instances", () => {
    const seed = createSeed("replay-42");
    const a = createSeededRandom(seed);
    const b = createSeededRandom(seed);
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = createSeededRandom(createSeed("alpha"));
    const b = createSeededRandom(createSeed("beta"));
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("int and shuffle are deterministic", () => {
    const seed = createSeed("shuffle-me");
    const r1 = createSeededRandom(seed);
    const r2 = createSeededRandom(seed);
    expect(r1.int(0, 100)).toBe(r2.int(0, 100));
    expect(r1.shuffle(["a", "b", "c", "d"])).toEqual(
      r2.shuffle(["a", "b", "c", "d"]),
    );
  });

  it("derive(parent, label) is stable across managers", () => {
    const parent = createSeed("root");
    const m1 = createSeedManager();
    const m2 = createSeedManager();
    expect(m1.derive(parent, "walk-1")).toEqual(m2.derive(parent, "walk-1"));
    expect(deriveSeed(parent, "walk-1")).toEqual(m1.derive(parent, "walk-1"));
    expect(m1.derive(parent, "walk-1")).not.toEqual(
      m1.derive(parent, "walk-2"),
    );
  });

  it("child streams from derive do not correlate with the parent stream", () => {
    const parent = createSeed("root");
    const child = deriveSeed(parent, "walk-1");
    const p = createSeededRandom(parent);
    const c = createSeededRandom(child);
    const parentSeq = Array.from({ length: 8 }, () => p.next());
    const childSeq = Array.from({ length: 8 }, () => c.next());
    expect(parentSeq).not.toEqual(childSeq);
    const p2 = createSeededRandom(parent);
    expect(Array.from({ length: 8 }, () => p2.next())).toEqual(parentSeq);
  });

  it("hashSeed is stable", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });

});
