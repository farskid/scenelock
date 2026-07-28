import type {
  CoverageCriterion,
  DiscoveryReport,
  DiscoveryRunner,
  Invariant,
  ModelEvent,
  ModelState,
  Seed,
  StateModel,
  Walk,
  WalkGenerator,
  WalkStep,
} from "@scenelock/core";

/**
 * @scenelock/discovery — statechart-generated walks + invariant runner.
 * XState-compatible models plug in via StateModel; no hard xstate dependency here.
 */

export type {
  CoverageCriterion,
  DiscoveryReport,
  DiscoveryRunner,
  Invariant,
  ModelEvent,
  ModelState,
  StateModel,
  Walk,
  WalkGenerator,
  WalkStep,
};

/** Collect unique transition keys "from|--|type" reachable by BFS (depth-limited). */
export function enumerateTransitions(
  model: StateModel,
  maxDepth = 32,
): { from: ModelState; event: ModelEvent; to: ModelState }[] {
  const out: { from: ModelState; event: ModelEvent; to: ModelState }[] = [];
  const seen = new Set<string>();
  const queue: { state: ModelState; depth: number }[] = [
    { state: model.initialState(), depth: 0 },
  ];
  const visitedStates = new Set<string>([JSON.stringify(model.initialState().value)]);

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth) continue;
    for (const event of model.transitions(item.state)) {
      const to = model.transition(item.state, event);
      if (!to) continue;
      const key = `${JSON.stringify(item.state.value)}|--|${event.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ from: item.state, event, to });
      }
      const sk = JSON.stringify(to.value);
      if (!visitedStates.has(sk)) {
        visitedStates.add(sk);
        queue.push({ state: to, depth: item.depth + 1 });
      }
    }
  }
  return out;
}

/**
 * Naive walk generator: one walk per enumerated transition (prefix path + that edge).
 * Real coverage solvers / fuzz schedules land in later phases.
 */
export function createWalkGenerator(): WalkGenerator {
  return {
    generate(model, criterion, seed) {
      const edges = enumerateTransitions(model);
      let walks: Walk[] = edges.map((edge, i) => ({
        id: `${model.id}-walk-${i}`,
        seed,
        steps: [{ event: edge.event, label: edge.event.type }] satisfies WalkStep[],
        tags: [`transition:${String(edge.from.value)}->${String(edge.to.value)}`],
      }));

      if (criterion.kind === "walk-count") {
        walks = walks.slice(0, criterion.count);
      }
      return walks;
    },
  };
}

export function createDiscoveryRunner(): DiscoveryRunner {
  return {
    async runWalk() {
      throw new Error("@scenelock/discovery: runWalk not implemented yet");
    },
    async runAll(): Promise<DiscoveryReport> {
      throw new Error("@scenelock/discovery: runAll not implemented yet");
    },
  };
}

/** Helper to define a tiny hand-written model without pulling xstate. */
export function defineStateModel(model: StateModel): StateModel {
  return model;
}
