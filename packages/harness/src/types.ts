import type {
  ExecutionTier,
  FailureEnvelope,
  Locator,
  PointerOptions,
  RasterFrame,
  SceneAdapter,
  SceneNode,
  ScenePredicate,
  SeedInput,
  SeededRandom,
  StepLoopDriver,
  StepUntilOptions,
  TypeOptions,
  VirtualClock,
} from "@scenelock/core";
import type { PageDriver } from "@scenelock/browser";
import type { GoldenRunResult } from "@scenelock/golden";
import type { GetByRoleOptions } from "@scenelock/scene";

/** Minimal store surface used by `t.golden.compare` (e.g. DirectoryGoldenStore). */
export interface HarnessGoldenStore {
  compare(testId: string, frame: RasterFrame): Promise<GoldenRunResult>;
}

/** Opaque handle from `t.ui.*` locators. */
export interface UiHandle {
  readonly kind: "ui";
  readonly locator: Locator;
}

/** Opaque handle from `t.scene.*` queries. */
export interface SceneHandle {
  readonly kind: "scene";
  readonly id: string;
  readonly node: SceneNode;
}

export type TargetHandle = UiHandle | SceneHandle;

export interface UiSurface {
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): UiHandle;
  getByLabel(label: string | RegExp, options?: { exact?: boolean }): UiHandle;
  getByText(text: string | RegExp, options?: { exact?: boolean }): UiHandle;
  getByTestId(testId: string): UiHandle;
  getByPlaceholder(placeholder: string | RegExp, options?: { exact?: boolean }): UiHandle;
}

export interface SceneSurface {
  getByRole(role: string, options?: GetByRoleOptions): SceneHandle;
  getBySceneId(id: string): SceneHandle;
  getByState(predicate: (node: SceneNode) => boolean): SceneHandle;
  /**
   * Live by default: re-snapshots the adapter unless {@link freeze} pinned a query.
   */
  snapshot(): Promise<SceneNode[]>;
  /**
   * Force a fresh `adapter.snapshot()` into the query cache.
   * When frozen, updates the pinned snapshot (stays frozen).
   */
  refresh(): Promise<void>;
  /**
   * Pin the current query snapshot. Subsequent sync queries + `snapshot()` reuse
   * the pin until {@link refresh} (which updates the pin) or a new harness.
   * Live mode (default) always re-reads the adapter — use freeze for determinism
   * across intentional mid-test mutations you do not want reflected yet.
   */
  freeze(): void;
}

export interface UserSurface {
  click(target: TargetHandle, options?: PointerOptions): Promise<void>;
  dblclick(target: TargetHandle, options?: PointerOptions): Promise<void>;
  hover(target: TargetHandle): Promise<void>;
  drag(from: TargetHandle, to: TargetHandle): Promise<void>;
  fill(target: TargetHandle, value: string, options?: TypeOptions): Promise<void>;
  type(target: TargetHandle, text: string, options?: TypeOptions): Promise<void>;
  press(key: string): Promise<void>;
}

export interface Expectation {
  toBeVisible(): Promise<void>;
  toBeHidden(): Promise<void>;
  toHaveText(expected: string | RegExp): Promise<void>;
  toHaveCount(expected: number): Promise<void>;
  toMatchScene(predicate: ScenePredicate): Promise<void>;
  toPass(fn: () => boolean | Promise<boolean>, message?: string): Promise<void>;
}

export interface ExpectSurface {
  (target: TargetHandle | (() => boolean | Promise<boolean>)): Expectation;
}

export interface GoldenSurface {
  compare(testId: string, frame: RasterFrame): Promise<GoldenRunResult>;
}

/**
 * Optional pointer sink for scene/golden tiers without a {@link PageDriver}.
 * Scene handles resolve coords via `adapter.locate()` then invoke this sink.
 */
export interface PointerSink {
  click(x: number, y: number, options?: PointerOptions): void | Promise<void>;
  dblclick?(x: number, y: number, options?: PointerOptions): void | Promise<void>;
  hover?(x: number, y: number): void | Promise<void>;
  drag?(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void | Promise<void>;
  type?(text: string, options?: TypeOptions): void | Promise<void>;
  fill?(value: string, options?: TypeOptions): void | Promise<void>;
  press?(key: string): void | Promise<void>;
}

export interface CreateHarnessOptions {
  readonly tier: ExecutionTier;
  readonly adapter?: SceneAdapter;
  readonly driver?: PageDriver;
  readonly seed?: SeedInput;
  readonly goldenStore?: HarnessGoldenStore;
  /** Step-driven host loop (scene/golden/browser determinism). */
  readonly stepLoop?: StepLoopDriver;
  /**
   * Pointer injection when no `driver` is bound (typical for scene-tier hosts).
   * Required for `t.user` pointer actions without a PageDriver.
   */
  readonly pointer?: PointerSink;
  /** Expect / action poll budget. Default 5000ms. */
  readonly timeoutMs?: number;
  readonly testId?: string;
  readonly file?: string;
  readonly title?: string;
}

/**
 * Unified harness — same object shape across tiers.
 * Dead subsurfaces throw {@link import("./tiers.js").TierPromotionError}; never `undefined`.
 */
export interface TestHarness {
  readonly tier: ExecutionTier;
  readonly seed: string;
  readonly ui: UiSurface;
  readonly scene: SceneSurface;
  readonly user: UserSurface;
  readonly clock: VirtualClock;
  readonly rng: SeededRandom;
  step(deltaMs?: number): Promise<void>;
  stepUntil(
    predicate: () => boolean | Promise<boolean>,
    options?: StepUntilOptions,
  ): Promise<void>;
  settled(): Promise<void>;
  readonly expect: ExpectSurface;
  readonly golden: GoldenSurface;
  /** Normalize a thrown error into a {@link FailureEnvelope} (seed + tier recorded). */
  toFailureEnvelope(error: unknown, extras?: { step?: string; locator?: Locator }): FailureEnvelope;
  dispose(): Promise<void>;
}

/** Error carrying a normalized {@link FailureEnvelope}. */
export class HarnessFailure extends Error {
  readonly envelope: FailureEnvelope;

  constructor(envelope: FailureEnvelope) {
    super(envelope.error.message);
    this.name = "HarnessFailure";
    this.envelope = envelope;
    if (envelope.error.stack !== undefined) {
      this.stack = envelope.error.stack;
    }
  }
}
