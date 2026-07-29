import { describe, expect, it } from "vitest";
import {
  appendAction,
  cloneSession,
  createEmptySession,
  isRecordingSession,
  parseSession,
  serializeSession,
} from "../session.js";
import type { RecordingSession } from "../types.js";

describe("RecordingSession JSON", () => {
  it("round-trips serialize ↔ parse", () => {
    const session: RecordingSession = {
      version: 1,
      metadata: {
        tier: "golden",
        seed: "g1",
        adapterContractVersion: "2",
        title: "gold",
      },
      actions: [
        {
          kind: "press",
          key: "Enter",
          timestamp: 42,
          modifiers: ["Shift"],
        },
      ],
    };
    const json = serializeSession(session);
    expect(json.endsWith("\n")).toBe(true);
    expect(parseSession(json)).toEqual(session);
    expect(cloneSession(session)).toEqual(session);
  });

  it("createEmptySession + appendAction", () => {
    let s = createEmptySession({ tier: "scene", seed: "x" });
    s = appendAction(s, {
      kind: "checkpoint",
      name: "a",
      timestamp: 0,
    });
    expect(s.actions).toHaveLength(1);
    expect(isRecordingSession(s)).toBe(true);
  });

  it("rejects invalid JSON shape", () => {
    expect(() => parseSession("{}")).toThrow(/invalid RecordingSession/);
    expect(isRecordingSession({ version: 2, metadata: {}, actions: [] })).toBe(false);
  });
});
