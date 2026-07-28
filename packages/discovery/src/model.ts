import type { ModelEvent, ModelState, StateModel } from "@scenelock/core";

/**
 * Declarative transition-table shape used for validation and easy authoring.
 * {@link StateModel} in `@scenelock/core` is the runtime interface (methods);
 * this table is the plain-object form we validate and compile.
 */
export interface TransitionEdge {
  readonly from: string;
  readonly event: string;
  readonly to: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface DeclarativeStateModel {
  readonly id: string;
  readonly initial: string;
  readonly states: readonly string[];
  readonly transitions: readonly TransitionEdge[];
}

export interface ModelValidationError {
  readonly code:
    | "empty-states"
    | "unknown-initial"
    | "unknown-transition-from"
    | "unknown-transition-to"
    | "unreachable-state"
    | "duplicate-state";
  readonly message: string;
  readonly state?: string;
  readonly edge?: TransitionEdge;
}

export interface ModelValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ModelValidationError[];
}

export interface EnumeratedTransition {
  readonly from: ModelState;
  readonly event: ModelEvent;
  readonly to: ModelState;
}

/**
 * XState v5 → {@link StateModel} mapping guide (no `xstate` dependency).
 *
 * | XState v5 | Scenelock {@link StateModel} / {@link DeclarativeStateModel} |
 * | --- | --- |
 * | `machine.id` | `id` |
 * | `machine.root.initial` / config `initial` | `initial` (flat string) or `initialState().value` |
 * | state node names (atomic / compound leaf) | `states[]` — use dot-paths for compound, e.g. `"editor.drawing"` |
 * | `on: { EVENT: "target" }` / `target: "#id.child"` | `{ from, event, to }` edges (resolve `#` ids to flat/dot values) |
 * | guarded transitions | encode as distinct event types or filter in `transition()` |
 * | actions / context updates | optional `payload` on {@link ModelEvent}; apply in harness `WalkExecutor`, not in the model |
 * | parallel regions | flatten active set to a canonical string key (sorted join) in `ModelState.value` |
 * | `machine.transition(state, event)` | `StateModel.transition(from, event)` |
 * | `state.can({ type })` / state.nextEvents | `StateModel.transitions(from)` |
 *
 * Recommended: author or compile to {@link DeclarativeStateModel}, then
 * {@link fromDeclarativeModel}. Defer a live `createActor` bridge until a
 * core-RFC adds an optional adapter peer; keep discovery free of `xstate`.
 */

/** Identity helper for hand-written {@link StateModel}s. */
export function defineStateModel(model: StateModel): StateModel {
  return model;
}

/** Canonical string key for a {@link ModelState} value. */
export function stateKey(state: ModelState): string {
  if (typeof state.value === "string") return state.value;
  return JSON.stringify(state.value);
}

/**
 * Validate a declarative model: known states, defined targets, reachability
 * from initial via BFS.
 */
export function validateModel(model: DeclarativeStateModel): ModelValidationResult {
  const errors: ModelValidationError[] = [];
  const stateSet = new Set(model.states);

  if (model.states.length === 0) {
    errors.push({ code: "empty-states", message: "model has no states" });
  }

  if (new Set(model.states).size !== model.states.length) {
    const seen = new Set<string>();
    for (const s of model.states) {
      if (seen.has(s)) {
        errors.push({
          code: "duplicate-state",
          message: `duplicate state id "${s}"`,
          state: s,
        });
      }
      seen.add(s);
    }
  }

  if (!stateSet.has(model.initial)) {
    errors.push({
      code: "unknown-initial",
      message: `initial state "${model.initial}" is not in states`,
      state: model.initial,
    });
  }

  for (const edge of model.transitions) {
    if (!stateSet.has(edge.from)) {
      errors.push({
        code: "unknown-transition-from",
        message: `transition from unknown state "${edge.from}"`,
        edge,
        state: edge.from,
      });
    }
    if (!stateSet.has(edge.to)) {
      errors.push({
        code: "unknown-transition-to",
        message: `transition to undefined target "${edge.to}"`,
        edge,
        state: edge.to,
      });
    }
  }

  if (stateSet.has(model.initial) && errors.every((e) => e.code !== "empty-states")) {
    const reachable = new Set<string>();
    const queue: string[] = [model.initial];
    reachable.add(model.initial);
    const byFrom = new Map<string, TransitionEdge[]>();
    for (const edge of model.transitions) {
      const list = byFrom.get(edge.from) ?? [];
      list.push(edge);
      byFrom.set(edge.from, list);
    }
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const edge of byFrom.get(cur) ?? []) {
        if (!reachable.has(edge.to) && stateSet.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    for (const s of model.states) {
      if (!reachable.has(s)) {
        errors.push({
          code: "unreachable-state",
          message: `state "${s}" is unreachable from initial "${model.initial}"`,
          state: s,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Compile a validated (or trusted) declarative table into a {@link StateModel}. */
export function fromDeclarativeModel(model: DeclarativeStateModel): StateModel {
  const byFrom = new Map<string, TransitionEdge[]>();
  for (const edge of model.transitions) {
    const list = byFrom.get(edge.from) ?? [];
    list.push(edge);
    byFrom.set(edge.from, list);
  }

  return {
    id: model.id,
    initialState: (): ModelState => ({ value: model.initial }),
    transitions(from: ModelState): readonly ModelEvent[] {
      const key = stateKey(from);
      const edges = byFrom.get(key) ?? [];
      return edges.map((e) => {
        const ev: ModelEvent = { type: e.event };
        if (e.payload !== undefined) {
          return { ...ev, payload: e.payload };
        }
        return ev;
      });
    },
    transition(from: ModelState, event: ModelEvent): ModelState | null {
      const key = stateKey(from);
      const edges = byFrom.get(key) ?? [];
      const match = edges.find((e) => e.event === event.type);
      if (!match) return null;
      const next: ModelState = { value: match.to };
      if (from.context !== undefined) {
        return { ...next, context: from.context };
      }
      return next;
    },
  };
}

/** Enumerate distinct state values reachable by BFS (depth-limited). */
export function enumerateStates(model: StateModel, maxDepth = 64): ModelState[] {
  const out: ModelState[] = [];
  const seen = new Set<string>();
  const queue: { state: ModelState; depth: number }[] = [
    { state: model.initialState(), depth: 0 },
  ];
  const initialKey = stateKey(model.initialState());
  seen.add(initialKey);
  out.push(model.initialState());

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth) continue;
    for (const event of model.transitions(item.state)) {
      const to = model.transition(item.state, event);
      if (!to) continue;
      const sk = stateKey(to);
      if (!seen.has(sk)) {
        seen.add(sk);
        out.push(to);
        queue.push({ state: to, depth: item.depth + 1 });
      }
    }
  }
  return out;
}

/**
 * Enumerate unique transitions `"from|--|type"` reachable by BFS.
 * Duplicate event types from the same state collapse to the first target found.
 */
export function enumerateTransitions(
  model: StateModel,
  maxDepth = 64,
): EnumeratedTransition[] {
  const out: EnumeratedTransition[] = [];
  const seen = new Set<string>();
  const queue: { state: ModelState; depth: number }[] = [
    { state: model.initialState(), depth: 0 },
  ];
  const visitedStates = new Set<string>([stateKey(model.initialState())]);

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth) continue;
    for (const event of model.transitions(item.state)) {
      const to = model.transition(item.state, event);
      if (!to) continue;
      const key = `${stateKey(item.state)}|--|${event.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ from: item.state, event, to });
      }
      const sk = stateKey(to);
      if (!visitedStates.has(sk)) {
        visitedStates.add(sk);
        queue.push({ state: to, depth: item.depth + 1 });
      }
    }
  }
  return out;
}

/** Transition coverage key used in reports and walk tags. */
export function transitionKey(from: ModelState, event: ModelEvent): string {
  return `${stateKey(from)}|--|${event.type}`;
}

export function transitionTag(from: ModelState, to: ModelState, event: ModelEvent): string {
  return `transition:${stateKey(from)}-${event.type}->${stateKey(to)}`;
}
