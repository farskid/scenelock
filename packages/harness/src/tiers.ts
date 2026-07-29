import type { ExecutionTier } from "@scenelock/core";

/**
 * Filename → tier convention (ticket 06):
 * - `*.test.ts` → scene (cheapest unmarked default)
 * - `*.browser.test.ts` → browser
 * - `*.golden.test.ts` → golden
 * - `*.smoke.test.ts` → smoke
 */
export const TIER_FILENAME_SUFFIX: Record<ExecutionTier, string> = {
  scene: ".test.ts",
  browser: ".browser.test.ts",
  golden: ".golden.test.ts",
  smoke: ".smoke.test.ts",
};

export const EXECUTION_TIERS: readonly ExecutionTier[] = [
  "scene",
  "browser",
  "golden",
  "smoke",
] as const;

/** Live capabilities for each tier. Dead subsurfaces throw {@link TierPromotionError}. */
export interface TierCapabilities {
  readonly ui: boolean;
  readonly scene: boolean;
  readonly golden: boolean;
  /** Virtual clock + seeded determinism pack. Smoke uses a real-time passthrough. */
  readonly determinism: boolean;
  /** Smoke is quarantined from the PR gate by default. */
  readonly quarantined: boolean;
}

export const TIER_CAPABILITIES: Readonly<Record<ExecutionTier, TierCapabilities>> = {
  scene: { ui: false, scene: true, golden: false, determinism: true, quarantined: false },
  browser: { ui: true, scene: true, golden: false, determinism: true, quarantined: false },
  golden: { ui: false, scene: true, golden: true, determinism: true, quarantined: false },
  smoke: { ui: true, scene: true, golden: false, determinism: false, quarantined: true },
};

/** Subsurface keys that may be gated by tier. */
export type HarnessSubsurface = "ui" | "scene" | "golden" | "clock" | "user" | "expect" | "rng";

const SUBSURFACE_REQUIRED_TIER: Partial<Record<HarnessSubsurface, ExecutionTier>> = {
  ui: "browser",
  golden: "golden",
};

/**
 * Thrown when a test accesses a dead subsurface for its tier.
 * Message names the required tier and filename suffix — no silent escalation.
 */
export class TierPromotionError extends Error {
  readonly subsurface: string;
  readonly currentTier: ExecutionTier;
  readonly requiredTier: ExecutionTier;
  readonly filenameSuffix: string;

  constructor(subsurface: string, currentTier: ExecutionTier, requiredTier: ExecutionTier) {
    const filenameSuffix = TIER_FILENAME_SUFFIX[requiredTier];
    super(
      `Subsurface "${subsurface}" is not available on tier "${currentTier}". ` +
        `Promote this test to tier "${requiredTier}" ` +
        `(rename file to use suffix "${filenameSuffix}").`,
    );
    this.name = "TierPromotionError";
    this.subsurface = subsurface;
    this.currentTier = currentTier;
    this.requiredTier = requiredTier;
    this.filenameSuffix = filenameSuffix;
  }
}

/** Infer tier from a test file path using the filename convention. */
export function tierFromFilename(filePath: string): ExecutionTier {
  const normalized = filePath.replace(/\\/g, "/");
  const base = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;

  if (/\.browser\.test\.[cm]?[jt]sx?$/.test(base)) return "browser";
  if (/\.golden\.test\.[cm]?[jt]sx?$/.test(base)) return "golden";
  if (/\.smoke\.test\.[cm]?[jt]sx?$/.test(base)) return "smoke";
  return "scene";
}

/** Assert a subsurface is live for `tier`; otherwise throw {@link TierPromotionError}. */
export function assertTierCapability(
  tier: ExecutionTier,
  subsurface: HarnessSubsurface,
): void {
  const caps = TIER_CAPABILITIES[tier];
  if (subsurface === "ui" && !caps.ui) {
    throw new TierPromotionError("ui", tier, SUBSURFACE_REQUIRED_TIER.ui ?? "browser");
  }
  if (subsurface === "golden" && !caps.golden) {
    throw new TierPromotionError("golden", tier, SUBSURFACE_REQUIRED_TIER.golden ?? "golden");
  }
  // scene / user / expect / rng / clock are always present (clock shimmed in smoke).
}
