import { describe, expect, it } from "vitest";
import {
  coveredTransitions,
  createWalkGenerator,
  enumerateTransitions,
  pathCoverageWalks,
  randomWalksForModel,
  transitionCoverageWalks,
} from "../index.js";
import { seedA, seedB, toy5Model } from "./fixtures.js";

describe("transitionCoverage", () => {
  it("covers every transition on the toy 5-state model", () => {
    const model = toy5Model();
    const all = enumerateTransitions(model);
    const walks = transitionCoverageWalks(model, seedA);
    const covered = coveredTransitions(model, walks);
    expect(covered.size).toBe(all.length);
    for (const edge of all) {
      const key = `${String(edge.from.value)}|--|${edge.event.type}`;
      expect(covered.has(key)).toBe(true);
    }
  });

  it("generate({kind:'transition'}) meets full coverage", () => {
    const model = toy5Model();
    const gen = createWalkGenerator();
    const walks = gen.generate(model, { kind: "transition", minCoverage: 1 }, seedA);
    const all = enumerateTransitions(model);
    expect(coveredTransitions(model, walks).size).toBe(all.length);
  });

  it("walk-count truncates", () => {
    const model = toy5Model();
    const walks = createWalkGenerator().generate(
      model,
      { kind: "walk-count", count: 1 },
      seedA,
    );
    expect(walks).toHaveLength(1);
  });
});

describe("pathCoverage", () => {
  it("emits bounded simple paths", () => {
    const model = toy5Model();
    const walks = pathCoverageWalks(model, 2, seedA);
    expect(walks.length).toBeGreaterThan(0);
    for (const w of walks) {
      expect(w.steps.length).toBeGreaterThanOrEqual(1);
      expect(w.steps.length).toBeLessThanOrEqual(2);
    }
  });

  it("generate({kind:'path'}) matches helper", () => {
    const model = toy5Model();
    const gen = createWalkGenerator();
    const a = gen.generate(model, { kind: "path", maxDepth: 2 }, seedA);
    const b = pathCoverageWalks(model, 2, seedA);
    expect(a.map((w) => w.steps.map((s) => s.event.type).join(">"))).toEqual(
      b.map((w) => w.steps.map((s) => s.event.type).join(">")),
    );
  });
});

describe("randomWalks determinism", () => {
  it("same seed ⇒ same walks", () => {
    const model = toy5Model();
    const a = randomWalksForModel(model, { count: 10, maxLength: 8 }, seedA);
    const b = randomWalksForModel(model, { count: 10, maxLength: 8 }, seedA);
    expect(
      a.map((w) => w.steps.map((s) => s.event.type).join(",")),
    ).toEqual(b.map((w) => w.steps.map((s) => s.event.type).join(",")));
  });

  it("different seeds ⇒ different sequences (almost surely)", () => {
    const model = toy5Model();
    const a = randomWalksForModel(model, { count: 5, maxLength: 12 }, seedA);
    const b = randomWalksForModel(model, { count: 5, maxLength: 12 }, seedB);
    expect(
      a.map((w) => w.steps.map((s) => s.event.type).join(",")).join("|"),
    ).not.toEqual(b.map((w) => w.steps.map((s) => s.event.type).join(",")).join("|"));
  });
});
