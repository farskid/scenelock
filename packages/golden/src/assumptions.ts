/**
 * Pinned software-rasterizer assumptions for bit-exact goldens.
 *
 * Determinism makes tolerance unnecessary: frames MUST come from a pinned
 * software rasterizer (e.g. ThorVG SW, Cairo, or host `render()→RGBA`).
 * GPU / compositor / browser blit paths are not golden sources.
 *
 * See research 02 (thin opt-in visual tier) and thesis 10 (determinism leg).
 */
export const RASTERIZER_ASSUMPTIONS = {
  /** Only software raster output is a valid golden source. */
  softwareOnly: true,
  /**
   * Cross-machine bit-exact is engine-tier only, and only when fonts/hinting
   * are pinned by the host. Geometry/fill goldens without text are OK sooner.
   */
  crossMachineBitExact: "engine-tier-only-when-fonts-pinned",
  /** No perceptual / tolerance API — bit-exact or fail. */
  tolerance: "none",
  /** Browser compositor output must not feed the golden store. */
  browserCompositor: "not-a-golden-source",
  /**
   * Callers must pass an explicit `rasterizerFingerprint` that is stored
   * inside each `.golden` file. Fingerprint mismatch is environment drift,
   * not a visual regression.
   */
  fingerprintRequired: true,
} as const;

/** Error code when stored fingerprint ≠ run fingerprint. */
export const FINGERPRINT_DRIFT_CODE = "environment-drift" as const;
