import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DirectoryGoldenStore } from "@scenelock/golden";
import { createHarness, tierFromFilename } from "@scenelock/harness";
import {
  TOY_RASTER_FINGERPRINT,
  ToyCanvasApp,
  createToySceneAdapter,
} from "../index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, "../../goldens");
const THIS_FILE = fileURLToPath(import.meta.url);

describe("toy harness e2e (golden tier)", () => {
  it("filename convention maps to golden", () => {
    expect(tierFromFilename(THIS_FILE)).toBe("golden");
  });

  it("compares committed toy-scene golden via t.golden", async () => {
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

    const t = await createHarness({
      tier: "golden",
      adapter: createToySceneAdapter(app),
      seed: "toy-golden-harness",
      goldenStore: store,
    });

    try {
      const box = t.scene.getByRole("rect", { name: "Box" });
      expect(box.id).toBe("r1");

      const result = await t.golden.compare("toy-scene", app.render());
      expect(result.verdict).toBe("match");
      expect(result.runFingerprint).toBe(TOY_RASTER_FINGERPRINT);
    } finally {
      await t.dispose();
    }
  });
});
