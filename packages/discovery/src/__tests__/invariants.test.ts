import { describe, expect, it } from "vitest";
import {
  idempotent,
  jsonStableEqual,
  roundTrip,
  snapshotStable,
  undoRedoIdentity,
} from "../index.js";
import type { SnapshotInvariantArgs, Walk } from "../index.js";
import type { Seed } from "@scenelock/core";

const walk: Walk = {
  id: "w",
  seed: { value: "s", numeric: 1 } satisfies Seed,
  steps: [{ event: { type: "DRAW" } }],
};

function args(
  snapshot: unknown,
  probe?: SnapshotInvariantArgs["probe"],
): SnapshotInvariantArgs {
  return {
    snapshot,
    walk,
    stepIndex: 0,
    history: [{ snapshot }],
    ...(probe ? { probe } : {}),
  };
}

describe("jsonStableEqual", () => {
  it("ignores key order", () => {
    expect(jsonStableEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
});

describe("snapshotStable", () => {
  it("passes on plain JSON data", async () => {
    const r = await snapshotStable().check(args({ x: 1 }));
    expect(r.ok).toBe(true);
  });
});

describe("roundTrip / undoRedoIdentity", () => {
  it("passes when action+inverse restores snapshot", async () => {
    const n = 5;
    const probe = (events: readonly { type: string }[]) => {
      let x = n;
      for (const e of events) {
        if (e.type === "INC") x += 1;
        if (e.type === "DEC") x -= 1;
      }
      return { n: x };
    };
    const r = await roundTrip({ type: "INC" }, { type: "DEC" }).check(
      args({ n }, probe),
    );
    expect(r.ok).toBe(true);
  });

  it("fails when inverse does not restore", async () => {
    const probe = () => ({ n: 99 });
    const r = await roundTrip({ type: "INC" }, { type: "DEC" }).check(
      args({ n: 1 }, probe),
    );
    expect(r.ok).toBe(false);
  });

  it("undoRedoIdentity aliases roundTrip(redo, undo)", async () => {
    const probe = (events: readonly { type: string }[]) => {
      let n = 0;
      for (const e of events) {
        if (e.type === "REDO") n += 1;
        if (e.type === "UNDO") n -= 1;
      }
      return { n };
    };
    const r = await undoRedoIdentity({ type: "REDO" }, { type: "UNDO" }).check(
      args({ n: 0 }, probe),
    );
    expect(r.ok).toBe(true);
  });
});

describe("idempotent", () => {
  it("passes when second apply is a no-op on snapshot", async () => {
    const probe = (events: readonly { type: string }[]) => {
      // SET is idempotent: always lands on same value
      return { v: events.length >= 1 ? 1 : 0 };
    };
    const r = await idempotent({ type: "SET" }).check(args({ v: 0 }, probe));
    expect(r.ok).toBe(true);
  });

  it("fails when second apply changes snapshot", async () => {
    const probe = (events: readonly { type: string }[]) => ({ count: events.length });
    const r = await idempotent({ type: "TICK" }).check(args({ count: 0 }, probe));
    expect(r.ok).toBe(false);
  });
});
