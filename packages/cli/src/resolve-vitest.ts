import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the vitest CLI entry from the nearest node_modules (peer / workspace).
 */
export function resolveVitestCli(): string {
  const require = createRequire(import.meta.url);
  try {
    const pkgJson = require.resolve("vitest/package.json");
    const pkg = require(pkgJson) as { bin?: string | Record<string, string> };
    const bin =
      typeof pkg.bin === "string"
        ? pkg.bin
        : (pkg.bin?.vitest ?? "vitest.mjs");
    const candidate = join(dirname(pkgJson), bin);
    if (existsSync(candidate)) return candidate;
  } catch {
    // fall through
  }

  // Walk up from this package looking for node_modules/.bin/vitest
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const bin = join(dir, "node_modules", "vitest", "vitest.mjs");
    if (existsSync(bin)) return bin;
    const shim = join(dir, "node_modules", ".bin", "vitest");
    if (existsSync(shim)) return shim;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    "Could not resolve vitest. Install vitest in the workspace (peer of @scenelock/cli).",
  );
}

/** Locate a vitest.config.* walking up from cwd. */
export function findVitestConfig(cwd: string): string | undefined {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    for (const name of ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"]) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
