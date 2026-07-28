/**
 * One-shot helper: UPDATE_GOLDENS=1 pnpm --filter @scenelock/toy-canvas-app test -t "write golden"
 * Writes examples/toy-canvas-app/goldens/toy-scene.golden
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DirectoryGoldenStore } from "@scenelock/golden";
import { TOY_RASTER_FINGERPRINT, ToyCanvasApp } from "../index.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../goldens");

describe("write golden", () => {
  it.skipIf(process.env.UPDATE_GOLDENS !== "1")(
    "writes toy-scene.golden for commit",
    async () => {
      await mkdir(GOLDEN_DIR, { recursive: true });
      const app = new ToyCanvasApp();
      app.add("rect", {
        id: "r1",
        name: "Box",
        x: 8,
        y: 8,
        width: 20,
        height: 16,
        fill: [220, 60, 60, 255],
      });
      app.add("ellipse", {
        id: "e1",
        name: "Oval",
        x: 28,
        y: 24,
        width: 24,
        height: 24,
        fill: [60, 120, 220, 255],
      });
      const store = new DirectoryGoldenStore({
        directory: GOLDEN_DIR,
        rasterizerFingerprint: TOY_RASTER_FINGERPRINT,
      });
      const result = await store.compare("toy-scene", app.render(), { update: true });
      expect(result.wroteBaseline).toBe(true);
    },
  );
});
