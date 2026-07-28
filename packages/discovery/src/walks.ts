import type {
  CoverageCriterion,
  ModelEvent,
  ModelState,
  Seed,
  StateModel,
  Walk,
  WalkGenerator,
  WalkStep,
} from "@scenelock/core";
import {
  enumerateTransitions,
  stateKey,
  transitionKey,
  transitionTag,
  type EnumeratedTransition,
} from "./model.js";
import { hashString, mulberry32 } from "./random.js";

/**
 * Extended criteria beyond frozen {@link CoverageCriterion}.
 * Ticket 15 should ratify these kinds (or fold into core via RFC).
 */
export type ExtendedCoverageCriterion =
  | CoverageCriterion
  | { kind: "path"; maxDepth: number }
  | { kind: "random"; count: number; maxLength: number };

export interface RandomWalkOptions {
  readonly count: number;
  readonly maxLength: number;
}

export interface DiscoveryWalkGenerator extends WalkGenerator {
  /** Core + extended criteria. */
  generate(
    model: StateModel,
    criterion: ExtendedCoverageCriterion,
    seed: Seed,
  ): Walk[];
  /**
   * Every transition at least once — greedy path cover
   * (new walk when stuck; prefers unused outgoing edges).
   */
  transitionCoverage(model: StateModel, seed: Seed): Walk[];
  /** All simple paths from initial with length ≤ maxDepth (edge count). */
  pathCoverage(model: StateModel, maxDepth: number, seed: Seed): Walk[];
  /** Seeded random walks — same seed ⇒ same walks. */
  randomWalks(model: StateModel, options: RandomWalkOptions, seed: Seed): Walk[];
}

function deriveSeed(parent: Seed, label: string): Seed {
  const value = `${parent.value}:${label}`;
  return { value, numeric: hashString(value) };
}

function stepsFromEvents(events: readonly ModelEvent[]): WalkStep[] {
  return events.map((event) => ({ event, label: event.type }));
}

/** Shortest path (event sequence) from `start` to a state matching `predicate`. */
function shortestEventPath(
  model: StateModel,
  start: ModelState,
  predicate: (s: ModelState) => boolean,
  maxDepth = 64,
): ModelEvent[] | null {
  if (predicate(start)) return [];
  const queue: { state: ModelState; path: ModelEvent[] }[] = [{ state: start, path: [] }];
  const seen = new Set<string>([stateKey(start)]);

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.path.length >= maxDepth) continue;
    for (const event of model.transitions(item.state)) {
      const to = model.transition(item.state, event);
      if (!to) continue;
      const sk = stateKey(to);
      if (seen.has(sk)) continue;
      const path = [...item.path, event];
      if (predicate(to)) return path;
      seen.add(sk);
      queue.push({ state: to, path });
    }
  }
  return null;
}

/**
 * Greedy transition cover: grow a walk by taking uncovered outgoing edges;
 * when none are local, shortest-path to a state that has one; else start a new walk.
 */
export function transitionCoverageWalks(model: StateModel, seed: Seed): Walk[] {
  const all = enumerateTransitions(model);
  const uncovered = new Set(all.map((e) => transitionKey(e.from, e.event)));
  const walks: Walk[] = [];
  let walkIndex = 0;

  while (uncovered.size > 0) {
    const events: ModelEvent[] = [];
    const tags: string[] = [];
    let state = model.initialState();
    let progress = true;

    while (progress && uncovered.size > 0) {
      progress = false;
      const local = model.transitions(state).filter((ev) => {
        const to = model.transition(state, ev);
        return to !== null && uncovered.has(transitionKey(state, ev));
      });

      if (local.length > 0) {
        const event = local[0]!;
        const from = state;
        const to = model.transition(state, event)!;
        events.push(event);
        tags.push(transitionTag(from, to, event));
        uncovered.delete(transitionKey(from, event));
        state = to;
        progress = true;
        continue;
      }

      const bridge = shortestEventPath(model, state, (s) =>
        model.transitions(s).some((ev) => {
          const to = model.transition(s, ev);
          return to !== null && uncovered.has(transitionKey(s, ev));
        }),
      );

      if (bridge === null) break;
      if (bridge.length === 0) break;

      for (const event of bridge) {
        const from = state;
        const to = model.transition(state, event);
        if (!to) break;
        events.push(event);
        const key = transitionKey(from, event);
        if (uncovered.has(key)) {
          uncovered.delete(key);
          tags.push(transitionTag(from, to, event));
        }
        state = to;
      }
      progress = true;
    }

    if (events.length === 0) {
      // Orphan transitions unreachable in practice — emit single-edge attempts from enumeration order.
      const remaining = all.find((e) => uncovered.has(transitionKey(e.from, e.event)));
      if (!remaining) break;
      const prefix =
        shortestEventPath(model, model.initialState(), (s) => stateKey(s) === stateKey(remaining.from)) ??
        [];
      const seq = [...prefix, remaining.event];
      const walkSeed = deriveSeed(seed, `tc-${walkIndex}`);
      walks.push({
        id: `${model.id}-tc-${walkIndex}`,
        seed: walkSeed,
        steps: stepsFromEvents(seq),
        tags: [transitionTag(remaining.from, remaining.to, remaining.event)],
      });
      uncovered.delete(transitionKey(remaining.from, remaining.event));
      walkIndex++;
      continue;
    }

    const walkSeed = deriveSeed(seed, `tc-${walkIndex}`);
    walks.push({
      id: `${model.id}-tc-${walkIndex}`,
      seed: walkSeed,
      steps: stepsFromEvents(events),
      tags,
    });
    walkIndex++;
  }

  return walks;
}

/** Bounded simple paths (no repeated state) from initial, edge length ≤ maxDepth. */
export function pathCoverageWalks(model: StateModel, maxDepth: number, seed: Seed): Walk[] {
  if (maxDepth < 0) {
    throw new Error("pathCoverage: maxDepth must be >= 0");
  }
  const walks: Walk[] = [];
  let walkIndex = 0;

  const dfs = (state: ModelState, path: ModelEvent[], visited: Set<string>): void => {
    if (path.length > 0) {
      const walkSeed = deriveSeed(seed, `path-${walkIndex}`);
      walks.push({
        id: `${model.id}-path-${walkIndex}`,
        seed: walkSeed,
        steps: stepsFromEvents(path),
        tags: [`path:len-${path.length}`],
      });
      walkIndex++;
    }
    if (path.length >= maxDepth) return;

    for (const event of model.transitions(state)) {
      const to = model.transition(state, event);
      if (!to) continue;
      const sk = stateKey(to);
      if (visited.has(sk)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(sk);
      dfs(to, [...path, event], nextVisited);
    }
  };

  const initial = model.initialState();
  dfs(initial, [], new Set([stateKey(initial)]));
  return walks;
}

/** Deterministic random walks using mulberry32(seed.numeric). */
export function randomWalksForModel(
  model: StateModel,
  options: RandomWalkOptions,
  seed: Seed,
): Walk[] {
  const { count, maxLength } = options;
  if (count < 0 || maxLength < 0) {
    throw new Error("randomWalks: count and maxLength must be >= 0");
  }
  const rng = mulberry32(seed.numeric);
  const walks: Walk[] = [];

  for (let i = 0; i < count; i++) {
    const events: ModelEvent[] = [];
    let state = model.initialState();
    for (let step = 0; step < maxLength; step++) {
      const legal = model
        .transitions(state)
        .map((event) => ({ event, to: model.transition(state, event) }))
        .filter((x): x is { event: ModelEvent; to: ModelState } => x.to !== null);
      if (legal.length === 0) break;
      const pick = legal[rng.int(0, legal.length)]!;
      events.push(pick.event);
      state = pick.to;
    }
    const walkSeed = deriveSeed(seed, `rand-${i}`);
    walks.push({
      id: `${model.id}-rand-${i}`,
      seed: walkSeed,
      steps: stepsFromEvents(events),
      tags: [`random:len-${events.length}`],
    });
  }
  return walks;
}

function walksForTransitionMinCoverage(
  model: StateModel,
  seed: Seed,
  minCoverage: number,
): Walk[] {
  const walks = transitionCoverageWalks(model, seed);
  if (minCoverage <= 0) return [];
  if (minCoverage >= 1) return walks;
  // Fractional: return a prefix of walks until estimated coverage ≥ min.
  const all = enumerateTransitions(model);
  if (all.length === 0) return walks;
  const need = Math.ceil(minCoverage * all.length);
  const covered = new Set<string>();
  const out: Walk[] = [];
  for (const walk of walks) {
    out.push(walk);
    let state = model.initialState();
    for (const step of walk.steps) {
      const key = transitionKey(state, step.event);
      const next = model.transition(state, step.event);
      if (!next) break;
      covered.add(key);
      state = next;
    }
    if (covered.size >= need) break;
  }
  return out;
}

function walksForStateMinCoverage(model: StateModel, seed: Seed, minCoverage: number): Walk[] {
  // Reuse transition cover — it visits states along the way — then trim.
  const walks = transitionCoverageWalks(model, seed);
  if (minCoverage <= 0) return [];
  const statesNeeded = new Set(
    enumerateTransitions(model).flatMap((e) => [stateKey(e.from), stateKey(e.to)]),
  );
  statesNeeded.add(stateKey(model.initialState()));
  const total = statesNeeded.size || 1;
  const need = minCoverage >= 1 ? total : Math.ceil(minCoverage * total);
  const visited = new Set<string>();
  const out: Walk[] = [];
  for (const walk of walks) {
    out.push(walk);
    let state = model.initialState();
    visited.add(stateKey(state));
    for (const step of walk.steps) {
      const next = model.transition(state, step.event);
      if (!next) break;
      visited.add(stateKey(next));
      state = next;
    }
    if (visited.size >= need) break;
  }
  return out;
}

/** One shallow walk per boundary seed count (first N transition-cover walks, re-seeded). */
function boundarySeedWalks(model: StateModel, seed: Seed, count: number): Walk[] {
  const base = transitionCoverageWalks(model, seed);
  const out: Walk[] = [];
  for (let i = 0; i < count; i++) {
    const src = base[i % Math.max(base.length, 1)];
    const walkSeed = deriveSeed(seed, `boundary-${i}`);
    if (!src) {
      out.push({
        id: `${model.id}-boundary-${i}`,
        seed: walkSeed,
        steps: [],
        tags: ["boundary-seeds"],
      });
      continue;
    }
    out.push({
      id: `${model.id}-boundary-${i}`,
      seed: walkSeed,
      steps: src.steps,
      tags: [...(src.tags ?? []), "boundary-seeds"],
    });
  }
  return out;
}

export function createWalkGenerator(): DiscoveryWalkGenerator {
  const api: DiscoveryWalkGenerator = {
    transitionCoverage: transitionCoverageWalks,
    pathCoverage: pathCoverageWalks,
    randomWalks: randomWalksForModel,
    generate(model, criterion, seed) {
      switch (criterion.kind) {
        case "transition":
          return walksForTransitionMinCoverage(model, seed, criterion.minCoverage);
        case "state":
          return walksForStateMinCoverage(model, seed, criterion.minCoverage);
        case "walk-count": {
          const all = transitionCoverageWalks(model, seed);
          return all.slice(0, criterion.count);
        }
        case "boundary-seeds":
          return boundarySeedWalks(model, seed, criterion.count);
        case "path":
          return pathCoverageWalks(model, criterion.maxDepth, seed);
        case "random":
          return randomWalksForModel(
            model,
            { count: criterion.count, maxLength: criterion.maxLength },
            seed,
          );
        default: {
          const _exhaustive: never = criterion;
          return _exhaustive;
        }
      }
    },
  };
  return api;
}

/** Simulate a walk on the model; returns null if an illegal step is encountered. */
export function simulateWalk(model: StateModel, walk: Walk): ModelState | null {
  let state = model.initialState();
  for (const step of walk.steps) {
    const next = model.transition(state, step.event);
    if (!next) return null;
    state = next;
  }
  return state;
}

/** Transitions covered by a set of walks (by replaying on the model). */
export function coveredTransitions(
  model: StateModel,
  walks: readonly Walk[],
): Set<string> {
  const covered = new Set<string>();
  for (const walk of walks) {
    let state = model.initialState();
    for (const step of walk.steps) {
      const key = transitionKey(state, step.event);
      const next = model.transition(state, step.event);
      if (!next) break;
      covered.add(key);
      state = next;
    }
  }
  return covered;
}

export function coveredStates(model: StateModel, walks: readonly Walk[]): Set<string> {
  const covered = new Set<string>([stateKey(model.initialState())]);
  for (const walk of walks) {
    let state = model.initialState();
    covered.add(stateKey(state));
    for (const step of walk.steps) {
      const next = model.transition(state, step.event);
      if (!next) break;
      covered.add(stateKey(next));
      state = next;
    }
  }
  return covered;
}

export type { EnumeratedTransition };
