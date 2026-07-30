import type { DomLocator, ExecutionTier, SceneAdapter } from "@scenelock/core";

/** Semantic action kinds captured by the recorder (not raw pointer coords). */
export type RecordedActionKind =
  | "click"
  | "dblclick"
  | "drag"
  | "type"
  | "press"
  | "checkpoint";

export type ModifierKey = "Alt" | "Control" | "Meta" | "Shift";

/** Scene locator emitted at record time (role+name preferred; id fallback). */
export type RecordedSceneLocator =
  | { readonly kind: "role"; readonly role: string; readonly name?: string }
  | { readonly kind: "sceneId"; readonly id: string };

/**
 * Resolved interaction target.
 * Raw points are a last-resort fallback and always flagged for codegen.
 */
export type RecordedTarget =
  | { readonly kind: "dom"; readonly locator: DomLocator }
  | { readonly kind: "scene"; readonly locator: RecordedSceneLocator }
  | {
      readonly kind: "point";
      readonly x: number;
      readonly y: number;
      /** Why the ladder failed — surfaced in codegen as FLAG. */
      readonly reason: "no-scene-match" | "no-dom-match";
      readonly flagged: true;
    };

export interface RecordedActionBase {
  readonly kind: RecordedActionKind;
  /** Virtual clock ms from session start (deterministic). */
  readonly timestamp: number;
  readonly modifiers?: readonly ModifierKey[];
}

export interface RecordedClickAction extends RecordedActionBase {
  readonly kind: "click" | "dblclick";
  readonly target: RecordedTarget;
}

export interface RecordedDragAction extends RecordedActionBase {
  readonly kind: "drag";
  readonly from: RecordedTarget;
  readonly to: RecordedTarget;
}

export interface RecordedTypeAction extends RecordedActionBase {
  readonly kind: "type";
  readonly target: RecordedTarget;
  readonly text: string;
}

export interface RecordedPressAction extends RecordedActionBase {
  readonly kind: "press";
  readonly key: string;
  readonly target?: RecordedTarget;
}

export interface RecordedCheckpointAction extends RecordedActionBase {
  readonly kind: "checkpoint";
  readonly name: string;
}

export type RecordedAction =
  | RecordedClickAction
  | RecordedDragAction
  | RecordedTypeAction
  | RecordedPressAction
  | RecordedCheckpointAction;

export interface RecordingSessionMetadata {
  readonly tier: ExecutionTier;
  readonly seed?: string;
  /** Host adapter `contractVersion` (always set when an adapter was bound). */
  readonly adapterContractVersion?: string;
  readonly title?: string;
  /** ISO timestamp of session finalization (wall clock; optional). */
  readonly recordedAt?: string;
}

/** JSON-serializable machine log for a single recorded flow. */
export interface RecordingSession {
  readonly version: 1;
  readonly metadata: RecordingSessionMetadata;
  readonly actions: readonly RecordedAction[];
}

/**
 * @deprecated Use {@link SceneAdapter} — `contractVersion` + optional `hitTest`
 * are now on the core adapter surface.
 */
export type RecorderSceneAdapter = SceneAdapter;

/** DOM element facts under the pointer (a11y ladder inputs). */
export interface DomElementInfo {
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly text?: string;
  readonly placeholder?: string;
  readonly alt?: string;
  readonly testId?: string;
  readonly bbox?: { x: number; y: number; width: number; height: number };
}

/**
 * Pluggable DOM context for locator resolution.
 * Implementations must support uniqueness counts so ambiguity falls to the next rung.
 */
export interface DomResolver {
  /** Element under the pointer, or null if none / canvas-only. */
  atPoint(x: number, y: number): DomElementInfo | null | Promise<DomElementInfo | null>;
  /** How many elements match this locator (strict uniqueness gate). */
  count(locator: DomLocator): number | Promise<number>;
}

/** Low-level input events fed into the recorder (event source is pluggable). */
export type RawInputEvent =
  | {
      readonly type: "pointerdown";
      readonly x: number;
      readonly y: number;
      readonly button?: number;
      readonly modifiers?: readonly ModifierKey[];
      readonly timestamp: number;
      /** Hint: prefer DOM vs scene resolution. Default: try DOM then scene. */
      readonly surface?: "dom" | "canvas" | "auto";
    }
  | {
      readonly type: "pointerup";
      readonly x: number;
      readonly y: number;
      readonly button?: number;
      readonly modifiers?: readonly ModifierKey[];
      readonly timestamp: number;
      readonly surface?: "dom" | "canvas" | "auto";
    }
  | {
      readonly type: "pointermove";
      readonly x: number;
      readonly y: number;
      readonly buttons?: number;
      readonly modifiers?: readonly ModifierKey[];
      readonly timestamp: number;
      readonly surface?: "dom" | "canvas" | "auto";
    }
  | {
      readonly type: "keydown";
      readonly key: string;
      readonly modifiers?: readonly ModifierKey[];
      readonly timestamp: number;
    }
  | {
      readonly type: "keyup";
      readonly key: string;
      readonly modifiers?: readonly ModifierKey[];
      readonly timestamp: number;
    }
  | {
      readonly type: "input";
      readonly text: string;
      readonly modifiers?: readonly ModifierKey[];
      readonly timestamp: number;
      readonly surface?: "dom" | "canvas" | "auto";
      readonly x?: number;
      readonly y?: number;
    };

export interface CreateRecorderOptions {
  readonly adapter?: SceneAdapter;
  readonly domResolver?: DomResolver;
  readonly tier?: ExecutionTier;
  readonly seed?: string;
  readonly title?: string;
  /**
   * Movement threshold (CSS px) before a down→up becomes a drag.
   * Default 4.
   */
  readonly dragThresholdPx?: number;
  /**
   * Max gap (virtual ms) between two clicks to coalesce into dblclick.
   * Default 300.
   */
  readonly dblclickWindowMs?: number;
}

export interface Recorder {
  /** Feed a low-level input event from any pluggable source. */
  feed(event: RawInputEvent): Promise<void>;
  /** Insert an assertion checkpoint marker (codegen emits expect stubs). */
  checkpoint(name: string): void;
  /** Flush pending coalesced state into the session log. */
  flush(): Promise<void>;
  /** Immutable snapshot of the current session. */
  session(): RecordingSession;
  /** Replace session actions (advanced; tests). */
  reset(options?: Partial<CreateRecorderOptions>): void;
}
