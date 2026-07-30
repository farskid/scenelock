import type { BBox, SceneAdapter, SceneNode, SceneNodeId } from "@scenelock/core";
import type { PageDriver } from "./driver.js";

/**
 * Page-side scene adapter bridge.
 *
 * Hosts expose a global (default `__scenelockScene`) with snapshot/locate/settled
 * (+ optional hitTest). This wrapper queries it via {@link PageDriver.evaluate}.
 */

export const DEFAULT_PAGE_SCENE_GLOBAL = "__scenelockScene";

export interface PageSceneBridgeOptions {
  /** Global property name on the page. Default `__scenelockScene`. */
  readonly globalName?: string;
  /**
   * Contract version stamped on the Node-side adapter.
   * Default `"page-bridge-v1"`.
   */
  readonly contractVersion?: string;
  /**
   * When true, forward optional page `hitTest`. Default false so absent page
   * hit-tests fall through to kit bbox containment.
   */
  readonly forwardHitTest?: boolean;
}

type PageSceneGlobal = {
  contractVersion?: string;
  snapshot: () => SceneNode[] | Promise<SceneNode[]>;
  locate: (id: string) => BBox | null | Promise<BBox | null>;
  settled: () => Promise<void>;
  hitTest?: (
    point: { x: number; y: number },
  ) => SceneNodeId | null | Promise<SceneNodeId | null>;
};

/**
 * Create a Node-side {@link SceneAdapter} that forwards to a page-exposed adapter.
 */
export function createPageSceneAdapter(
  driver: PageDriver,
  options: PageSceneBridgeOptions = {},
): SceneAdapter {
  const globalName = options.globalName ?? DEFAULT_PAGE_SCENE_GLOBAL;
  const fallbackVersion = options.contractVersion ?? "page-bridge-v1";

  const hitTest = async (point: {
    x: number;
    y: number;
  }): Promise<SceneNodeId | null> => {
    return driver.evaluate(
      (args) => {
        const g = (globalThis as unknown as Record<string, unknown>)[args.name] as
          | PageSceneGlobal
          | undefined;
        if (g === undefined) {
          throw new Error(`Page scene adapter missing at globalThis.${args.name}`);
        }
        if (typeof g.hitTest !== "function") {
          return null;
        }
        return g.hitTest(args.point);
      },
      { name: globalName, point },
    );
  };

  return {
    contractVersion: fallbackVersion,

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

    ...(options.forwardHitTest ? { hitTest } : {}),
  };
}
