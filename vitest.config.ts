import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@scenelock/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@scenelock/executor": path.resolve(__dirname, "packages/executor/src/index.ts"),
      "@scenelock/scene": path.resolve(__dirname, "packages/scene/src/index.ts"),
      "@scenelock/browser": path.resolve(__dirname, "packages/browser/src/index.ts"),
      "@scenelock/discovery": path.resolve(__dirname, "packages/discovery/src/index.ts"),
      "@scenelock/golden": path.resolve(__dirname, "packages/golden/src/index.ts"),
      "@scenelock/harness": path.resolve(__dirname, "packages/harness/src/index.ts"),
      "@scenelock/recorder": path.resolve(__dirname, "packages/recorder/src/index.ts"),
    },
  },
  test: {
    // root pins glob resolution to the repo root so per-package runs
    // (vitest run --config ../../vitest.config.ts --dir .) still resolve
    root: __dirname,
    // first two patterns serve whole-repo runs; "src/**" serves per-package
    // runs where --dir . rebases glob matching to the package directory
    include: [
      "packages/*/src/**/*.test.ts",
      "examples/*/src/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    environment: "node",
  },
});
