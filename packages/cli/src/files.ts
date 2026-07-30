import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { ExecutionTier } from "@scenelock/core";
import { tierFromFilename } from "@scenelock/harness";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".turbo",
  ".vite",
]);

function isTestFile(name: string): boolean {
  return /\.test\.[cm]?[jt]sx?$/.test(name);
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".") continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full, out);
      continue;
    }
    if (ent.isFile() && isTestFile(ent.name)) {
      out.push(full);
    }
  }
}

/** Collect test files under `roots` (absolute), optionally filtered by tier. */
export function collectTestFiles(options: {
  readonly cwd: string;
  readonly roots?: readonly string[];
  readonly tier?: ExecutionTier;
  /** Extra path substrings / relative globs used as filters. */
  readonly filters?: readonly string[];
}): string[] {
  const roots =
    options.roots ??
    ["packages", "examples", "src"]
      .map((r) => resolve(options.cwd, r))
      .filter((r) => {
        try {
          return statSync(r).isDirectory();
        } catch {
          return false;
        }
      });

  // Always include cwd itself when no standard roots exist.
  const searchRoots = roots.length > 0 ? roots : [options.cwd];
  const found: string[] = [];
  for (const root of searchRoots) {
    walk(root, found);
  }

  let files = found;
  if (options.tier !== undefined) {
    files = files.filter((f) => tierFromFilename(f) === options.tier);
  }

  const filters = options.filters ?? [];
  if (filters.length > 0) {
    files = files.filter((f) => {
      const rel = relative(options.cwd, f);
      return filters.some((pat) => matchFilter(rel, f, pat));
    });
  }

  return [...new Set(files)].sort();
}

/** Lightweight filter: substring, basename, or simple `*` glob on the relative path. */
function matchFilter(rel: string, abs: string, pat: string): boolean {
  const normalizedPat = pat.replace(/\\/g, "/");
  const normalizedRel = rel.replace(/\\/g, "/");
  const normalizedAbs = abs.replace(/\\/g, "/");

  if (!normalizedPat.includes("*")) {
    return (
      normalizedRel.includes(normalizedPat) ||
      normalizedAbs.includes(normalizedPat) ||
      normalizedRel.endsWith(normalizedPat)
    );
  }

  // Convert a simple glob to RegExp (** / *).
  const re = new RegExp(
    `^${normalizedPat
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, ":::GLOBSTAR:::")
      .replace(/\*/g, "[^/]*")
      .replace(/:::GLOBSTAR:::/g, ".*")}$`,
  );
  return re.test(normalizedRel) || re.test(normalizedAbs);
}
