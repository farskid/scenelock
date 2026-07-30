import type { ExecutionTier } from "@scenelock/core";
import { tierIncludeGlobs } from "@scenelock/harness";

/**
 * Compute vitest include patterns from optional `--tier` + user globs.
 *
 * - `--tier` alone → {@link tierIncludeGlobs} (scene excludes heavier suffixes)
 * - user globs alone → those globs as-is
 * - both → user globs preferred as filters; tier globs still returned for include
 * - neither → scene-tier PR default
 */
export function computeIncludeGlobs(options: {
  readonly tier?: ExecutionTier;
  readonly globs?: readonly string[];
}): string[] {
  const user = options.globs ?? [];
  if (user.length > 0 && options.tier === undefined) {
    return [...user];
  }
  if (user.length > 0 && options.tier !== undefined) {
    // Positional globs act as vitest filters; tier still drives include.
    return tierIncludeGlobs(options.tier);
  }
  if (options.tier !== undefined) {
    return tierIncludeGlobs(options.tier);
  }
  return tierIncludeGlobs("scene");
}

/** Vitest positional filters (user globs), if any. */
export function computeVitestFilters(globs: readonly string[]): string[] {
  return [...globs];
}
