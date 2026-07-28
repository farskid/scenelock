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
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "examples/*/src/**/*.test.ts"],
    environment: "node",
  },
});
