export type { BBox } from "./bbox.js";
export { bboxCenter, bboxContains } from "./bbox.js";

export type {
  DomLocatorKind,
  RoleLocator,
  LabelLocator,
  TextLocator,
  PlaceholderLocator,
  AltLocator,
  TestIdLocator,
  SceneLocator,
  StructuralLocator,
  DomLocator,
  Locator,
  LocatorPriority,
} from "./locators.js";
export { DEFAULT_LOCATOR_PRIORITY } from "./locators.js";

export type {
  TestStatus,
  FailureError,
  FailureArtifacts,
  FailureEnvelope,
  ExecutionTier,
} from "./failure.js";
export { FAILURE_ENVELOPE_JSON_SCHEMA } from "./failure.js";

export type { SeedInput, Seed, SeededRandom, SeedManager } from "./seed.js";

export type { VirtualClock, ClockOptions, TimerHandle } from "./clock.js";

export type {
  SceneNode,
  SceneAdapter,
  SceneQuery,
  ScenePredicate,
  RasterSurface,
} from "./scene.js";

export type {
  StepLoopDriver,
  StepUntilOptions,
  ExecutorContext,
  ExecutorOptions,
  DeterministicExecutor,
  DeterministicExecutorFactory,
} from "./executor.js";

export type {
  PointerOptions,
  TypeOptions,
  Expectation,
  HarnessHandle,
  Harness,
  HarnessFactoryOptions,
  HarnessFactory,
} from "./dsl.js";

export type {
  ModelEvent,
  ModelState,
  TransitionEdge,
  DeclarativeStateModel,
  StateModel,
  WalkStep,
  Walk,
  CoverageCriterion,
  WalkGenerator,
  DiscoveryViolation,
  InvariantContext,
  Invariant,
  WalkExecutor,
  DiscoveryRunner,
  DiscoveryReport,
} from "./discovery.js";

export type {
  RasterFrame,
  Rgba,
  PixelDiffSample,
  GoldenVerdict,
  GoldenDiff,
  GoldenStore,
  GoldenCompareOptions,
  GoldenCompare,
} from "./golden.js";

export type {
  BrowserLaunchOptions,
  BrowserSession,
  BrowserEngine,
  LocatorBridge,
} from "./browser.js";
