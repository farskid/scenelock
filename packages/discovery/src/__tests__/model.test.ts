import { describe, expect, it } from "vitest";
import {
  defineStateModel,
  enumerateStates,
  enumerateTransitions,
  fromDeclarativeModel,
  validateModel,
} from "../index.js";
import type { DeclarativeStateModel } from "../index.js";
import type { ModelEvent, ModelState } from "@scenelock/core";
import { TOY_5 } from "./fixtures.js";

describe("validateModel", () => {
  it("accepts the toy 5-state model", () => {
    const result = validateModel(TOY_5);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("flags undefined transition targets", () => {
    const bad: DeclarativeStateModel = {
      id: "bad-target",
      initial: "a",
      states: ["a"],
      transitions: [{ from: "a", event: "GO", to: "missing" }],
    };
    const result = validateModel(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "unknown-transition-to")).toBe(true);
  });

  it("flags unreachable states", () => {
    const bad: DeclarativeStateModel = {
      id: "orphan",
      initial: "a",
      states: ["a", "orphan"],
      transitions: [{ from: "a", event: "LOOP", to: "a" }],
    };
    const result = validateModel(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "unreachable-state" && e.state === "orphan")).toBe(
      true,
    );
  });

  it("flags unknown initial", () => {
    const bad: DeclarativeStateModel = {
      id: "no-init",
      initial: "nope",
      states: ["a"],
      transitions: [],
    };
    const result = validateModel(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "unknown-initial")).toBe(true);
  });
});

describe("enumerate", () => {
  it("enumerates all 5 states and all transitions on toy5", () => {
    const model = fromDeclarativeModel(TOY_5);
    const states = enumerateStates(model);
    expect(states.map((s) => s.value).sort()).toEqual(
      ["drawing", "error", "idle", "ready", "saved"].sort(),
    );
    const edges = enumerateTransitions(model);
    expect(edges.length).toBe(TOY_5.transitions.length);
  });

  it("works with defineStateModel hand-written machines", () => {
    const model = defineStateModel({
      id: "toggle",
      initialState: (): ModelState => ({ value: "off" }),
      transitions(_from): ModelEvent[] {
        return [{ type: "TOGGLE" }];
      },
      transition(from, event): ModelState | null {
        if (event.type !== "TOGGLE") return null;
        return { value: from.value === "off" ? "on" : "off" };
      },
    });
    expect(enumerateStates(model)).toHaveLength(2);
    expect(enumerateTransitions(model)).toHaveLength(2);
  });
});
