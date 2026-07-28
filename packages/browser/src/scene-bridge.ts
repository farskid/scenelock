import type { BBox, SceneAdapter, SceneNode } from "@scenelock/core";
import type { PageDriver } from "./driver.js";

/**
 * Page-side scene adapter bridge.
 *
 * Hosts expose a global (default `__scenelockScene`) with snapshot/locate/settled.
 * This wrapper queries it via {@link PageDriver.evaluate}.
 */

export const DEFAULT_PAGE_SCENE_GLOBAL = "__scenelockScene";

export interface PageSceneBridgeOptions {
  /** Global property name on the page. Default `__scenelockScene`. */
  readonly globalName?: string;
}

type PageSceneGlobal = {
  snapshot: () => SceneNode[] | Promise<SceneNode[]>;
  locate: (id: string) => BBox | null | Promise<BBox | null>;
  settled: () => Promise<void>;
};

/**
 * Create a Node-side {@link SceneAdapter} that forwards to a page-exposed adapter.
 */
export function createPageSceneAdapter(
  driver: PageDriver,
  options: PageSceneBridgeOptions = {},
): SceneAdapter {
  const globalName = options.globalName ?? DEFAULT_PAGE_SCENE_GLOBAL;

  return {
    async snapshot(): Promise<SceneNode[]> {
      return driver.evaluate((name) => {
        const g = (globalThis as unknown as Record<string, unknown>)[name] as
          | PageSceneGlobal
          | undefined;
        if (g === undefined || typeof g.snapshot !== "function") {
          throw new Error(`Page scene adapter missing at globalThis.${name}`);
        }
        return g.snapshot();
      }, globalName);
    },

    async locate(id: string): Promise<BBox | null> {
      return driver.evaluate(
        (args) => {
          const g = (globalThis as unknown as Record<string, unknown>)[args.name] as
            | PageSceneGlobal
            | undefined;
          if (g === undefined || typeof g.locate !== "function") {
            throw new Error(`Page scene adapter missing at globalThis.${args.name}`);
          }
          return g.locate(args.id);
        },
        { name: globalName, id },
      );
    },

    async settled(): Promise<void> {
      await driver.evaluate((name) => {
        const g = (globalThis as unknown as Record<string, unknown>)[name] as
          | PageSceneGlobal
          | undefined;
        if (g === undefined || typeof g.settled !== "function") {
          throw new Error(`Page scene adapter missing at globalThis.${name}`);
        }
        return g.settled();
      }, globalName);
    },
  };
}
