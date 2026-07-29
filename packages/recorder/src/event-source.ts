import type { RawInputEvent, Recorder } from "./types.js";

/** Pluggable low-level input source for {@link Recorder.feed}. */
export interface RecordEventSource {
  start(onEvent: (event: RawInputEvent) => void | Promise<void>): Promise<void> | void;
  stop(): Promise<void> | void;
}

/** Wire a source into a recorder (awaits async feed handlers). */
export async function attachRecorderSource(
  recorder: Recorder,
  source: RecordEventSource,
): Promise<() => Promise<void>> {
  await source.start(async (event) => {
    await recorder.feed(event);
  });
  return async () => {
    await source.stop();
    await recorder.flush();
  };
}

/**
 * Imperative event source for tests — push {@link RawInputEvent}s directly.
 * Compatible with FakePageDriver-driven unit tests (no browser).
 */
export function createFakeEventSource(): RecordEventSource & {
  emit(event: RawInputEvent): Promise<void>;
  readonly events: readonly RawInputEvent[];
} {
  let handler: ((event: RawInputEvent) => void | Promise<void>) | null = null;
  const events: RawInputEvent[] = [];

  return {
    events,
    start(onEvent) {
      handler = onEvent;
    },
    stop() {
      handler = null;
    },
    async emit(event) {
      events.push(event);
      if (handler === null) {
        throw new Error("FakeEventSource: emit before start()");
      }
      await handler(event);
    },
  };
}
