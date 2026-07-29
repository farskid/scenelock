import type { RecordingSession, RecordingSessionMetadata, RecordedAction } from "./types.js";

export const RECORDING_SESSION_VERSION = 1 as const;

export function createEmptySession(
  metadata: RecordingSessionMetadata,
): RecordingSession {
  return {
    version: RECORDING_SESSION_VERSION,
    metadata: { ...metadata },
    actions: [],
  };
}

export function appendAction(
  session: RecordingSession,
  action: RecordedAction,
): RecordingSession {
  return {
    version: session.version,
    metadata: session.metadata,
    actions: [...session.actions, action],
  };
}

export function replaceActions(
  session: RecordingSession,
  actions: readonly RecordedAction[],
): RecordingSession {
  return {
    version: session.version,
    metadata: session.metadata,
    actions: [...actions],
  };
}

/** Machine-readable JSON (stable key order for snapshots). */
export function serializeSession(session: RecordingSession): string {
  return `${JSON.stringify(session, null, 2)}\n`;
}

export function parseSession(json: string): RecordingSession {
  const parsed: unknown = JSON.parse(json);
  if (!isRecordingSession(parsed)) {
    throw new Error("@scenelock/recorder: invalid RecordingSession JSON");
  }
  return parsed;
}

export function isRecordingSession(value: unknown): value is RecordingSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (typeof v.metadata !== "object" || v.metadata === null) return false;
  const meta = v.metadata as Record<string, unknown>;
  if (typeof meta.tier !== "string") return false;
  if (!Array.isArray(v.actions)) return false;
  return true;
}

/** Deep-clone via JSON (session is JSON-serializable by construction). */
export function cloneSession(session: RecordingSession): RecordingSession {
  return parseSession(JSON.stringify(session));
}
