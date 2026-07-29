import type { ExecutionTier } from "@scenelock/core";
import { TIER_FILENAME_SUFFIX } from "./tiers.js";

/**
 * Filename convention (ticket 06) — documented helper for vitest `include` globs.
 *
 * - scene   → unmarked `*.test.ts` (cheapest default)
 * - browser → `*.browser.test.ts`
 * - golden  → `*.golden.test.ts`
 * - smoke   → `*.smoke.test.ts`
 *
 * Tier-specific suffixes also match a broad `*.test.ts` glob; split vitest
 * projects via {@link tierIncludeGlobs} when you need to run tiers separately.
 */
export const TIER_FILENAME_CONVENTION = {
  scene: "**/*.test.ts",
  browser: "**/*.browser.test.ts",
  golden: "**/*.golden.test.ts",
  smoke: "**/*.smoke.test.ts",
} as const satisfies Record<ExecutionTier, string>;

/** Glob patterns that select only `tier` (excluding unmarked scene for non-scene). */
export function tierIncludeGlobs(tier: ExecutionTier): string[] {
  if (tier === "scene") {
    // Scene = unmarked only — exclude heavier suffixes.
    return [
      "**/*.test.ts",
      "!**/*.browser.test.ts",
      "!**/*.golden.test.ts",
      "!**/*.smoke.test.ts",
    ];
  }
  return [TIER_FILENAME_CONVENTION[tier]];
}

/**
 * Suggested vitest project fragment documenting the tier filename convention.
 * Callers merge into their own `defineConfig({ test: { … } })`.
 */
export function scenelockVitestTierProjects(root = "."): Array<{
  name: ExecutionTier;
  root: string;
  test: { include: string[] };
}> {
  return (["scene", "browser", "golden", "smoke"] as const).map((tier) => ({
    name: tier,
    root,
    test: { include: tierIncludeGlobs(tier) },
  }));
}

/** Human-readable convention blurb for docs / CLI help. */
export function describeTierFilenameConvention(): string {
  return (
    "Tier from filename: " +
    (Object.entries(TIER_FILENAME_SUFFIX) as Array<[ExecutionTier, string]>)
      .map(([tier, suffix]) => `${suffix} → ${tier}`)
      .join("; ") +
    " (unmarked *.test.ts defaults to scene)."
  );
}
