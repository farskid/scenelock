/**
 * `@scenelock/recorder` — non-interactive action recording + harness DSL codegen.
 *
 * Output = FILES + machine log (never Inspector-copy). Locator emission ladder:
 * DOM role+name → label/text → testId; canvas → scene.getByRole / getBySceneId via
 * adapter hit-test at record time; raw coordinates only as flagged fallback.
 */

export type {
  RecordedActionKind,
  ModifierKey,
  RecordedSceneLocator,
  RecordedTarget,
  RecordedActionBase,
  RecordedClickAction,
  RecordedDragAction,
  RecordedTypeAction,
  RecordedPressAction,
  RecordedCheckpointAction,
  RecordedAction,
  RecordingSessionMetadata,
  RecordingSession,
  RecorderSceneAdapter,
  DomElementInfo,
  DomResolver,
  RawInputEvent,
  CreateRecorderOptions,
  Recorder,
} from "./types.js";

export { createRecorder } from "./recorder.js";

export {
  RECORDING_SESSION_VERSION,
  createEmptySession,
  appendAction,
  replaceActions,
  serializeSession,
  parseSession,
  isRecordingSession,
  cloneSession,
} from "./session.js";

export {
  resolveDomTarget,
  hitTestScene,
  resolveSceneLocator,
  resolveSceneTarget,
  resolvePointTarget,
  type ResolvePointOptions,
} from "./resolve.js";

export { emitTest, emitLog, type EmitTestOptions, type EmitTestResult } from "./codegen.js";

export {
  createFakeDomResolver,
  type FakeDomElement,
} from "./dom-resolver.js";

export {
  attachRecorderSource,
  createFakeEventSource,
  type RecordEventSource,
} from "./event-source.js";

export {
  RECORDER_BINDING,
  createPageDriverEventSource,
  pushPageRecorderEvent,
  type PageRecorderEvent,
  type PageDriverEventSourceOptions,
} from "./browser-source.js";
