import type { Locator } from "./locators.js";
import type { SceneAdapter, SceneNode, ScenePredicate } from "./scene.js";
import type { ExecutorContext } from "./executor.js";
import type { BBox } from "./bbox.js";

/**
 * Harness DSL surface — one API spanning DOM chrome + canvas scene.
 * Implementations live in @scenelock/browser (DOM) and @scenelock/scene (canvas).
 * This module owns the contracts only.
 */

export interface PointerOptions {
  button?: "left" | "right" | "middle";
  modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift">;
  /** Click count. Default 1. */
  clickCount?: number;
}

export interface TypeOptions {
  delayMs?: number;
  /** Clear before typing. */
  clear?: boolean;
}

/** Web-first style assertion target — auto-wait / poll until timeout. */
export interface Expectation<T = unknown> {
  toBeVisible(): Promise<void>;
  toBeHidden(): Promise<void>;
  toHaveText(expected: string | RegExp): Promise<void>;
  toHaveValue(expected: string | RegExp): Promise<void>;
  toHaveCount(expected: number): Promise<void>;
  toMatchScene(predicate: ScenePredicate): Promise<void>;
  /** Escape for custom predicates; still polled. */
  toPass(fn: (actual: T) => boolean | Promise<boolean>, message?: string): Promise<void>;
}

export interface HarnessHandle {
  click(options?: PointerOptions): Promise<void>;
  dblclick(options?: PointerOptions): Promise<void>;
  hover(): Promise<void>;
  fill(value: string, options?: TypeOptions): Promise<void>;
  type(text: string, options?: TypeOptions): Promise<void>;
  press(key: string): Promise<void>;
  /** Bounding box used for the interaction (DOM or scene.locate). */
  bbox(): Promise<BBox | null>;
  expect(): Expectation;
}

export interface Harness {
  /** Resolve a locator to a handle (DOM or scene). */
  locate(locator: Locator): HarnessHandle;
  /** Convenience constructors matching locator policy. */
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): HarnessHandle;
  getByLabel(label: string | RegExp, options?: { exact?: boolean }): HarnessHandle;
  getByText(text: string | RegExp, options?: { exact?: boolean }): HarnessHandle;
  getByTestId(testId: string): HarnessHandle;
  getBySceneId(id: string): HarnessHandle;

  /** Scene adapter accessors when a canvas host is bound. */
  scene(): SceneAdapter;
  snapshotScene(): Promise<SceneNode[]>;
  /** Wait for host settledness (adapter.settled or stepLoop.settled). */
  settled(): Promise<void>;

  /** Executor context for the current run (seed/clock/random). */
  ctx(): ExecutorContext;
}

export interface HarnessFactoryOptions {
  scene?: SceneAdapter;
}

export interface HarnessFactory {
  create(ctx: ExecutorContext, options?: HarnessFactoryOptions): Harness;
}
