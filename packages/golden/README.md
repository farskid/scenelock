# `@scenelock/golden`

Bit-exact RGBA golden comparison for the scenelock **engine** tier.

## Rasterizer pin (read first)

Goldens are valid only when frames come from a **pinned software rasterizer**.
Determinism makes tolerance unnecessary — there is no tolerance / perceptual API.

| Assumption | Policy |
| --- | --- |
| Software only | ThorVG SW, Cairo, or host `render()→RGBA` |
| Fingerprint | Callers pass `rasterizerFingerprint`; stored in every `.golden` |
| Fingerprint mismatch | **Environment drift**, not a visual regression |
| GPU / browser compositor | Not a golden source |
| Fonts / text | Bit-exact cross-machine only when fonts + hinting are pinned |
| Tolerance | **None** |

Exported as `RASTERIZER_ASSUMPTIONS`.

## Format

Self-contained `.golden` files (no PNG deps):

- Magic `SLGN` + version + flags
- Width / height
- UTF-8 `rasterizerFingerprint`
- SHA-256 of uncompressed RGBA
- Raw or zlib-deflated pixel payload (`node:zlib`)

## Compare

1. Hash fast path (SHA-256 equal → match)
2. On mismatch: structured JSON diff report — differing pixel count, bounding box, first N coords with actual/expected RGBA (token-cheap; no image dumps)

## Store

`DirectoryGoldenStore` keys baselines by test id:

- Missing baseline → `missing-baseline` (never auto-pass)
- `update` / `updateGoldens` writes baseline but still fails the run until a clean re-assert
- `reportStale()` lists on-disk goldens with no owner in the current run (report only)

## Failure envelope

`toFailureEnvelope` maps mismatches to core `FailureEnvelope` with `tier: "engine"` (nearest core tier; core has no `"golden"` variant) and `error.matcher: "golden"`. Artifact paths: actual / expected / diff-report.
