# Scenelock — Implementation Plan

Phased plan for parallel coding agents. Each package is an independent work unit with explicit interface boundaries defined in `@scenelock/core`.

---

## Freeze rule (historical — wave 1)

Wave 1 ran under a core freeze. **Wave 2 lifted the freeze** for the integrator: core v2 contracts are ratified and packages consume them. Further core changes should still prefer small, deliberate RFCs — but the hard freeze table below is **done**.

| Path | Wave-1 status | Wave-2 status |
| --- | --- | --- |
| `packages/core/**` | FROZEN | **Open** (v2 landed; tiers renamed to scene/browser/golden/smoke) |
| Root configs | FROZEN | Amend carefully |
| `IMPLEMENTATION_PLAN.md`, `README.md` | Docs PRs | Updated this wave |
| Package sources | Per-agent ownership | Shared for integration |

---

## Dependency graph

```
                    ┌──────────────┐
                    │ @scenelock/  │
                    │    core      │  ← v2 contracts
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               │
   ┌──────────────┐ ┌──────────────┐       │
   │  executor    │ │    scene     │       │
   └──────┬───────┘ └──────┬───────┘       │
          │                │               │
          └────────┬───────┘               │
                   ▼                       ▼
     ┌─────────────┼─────────────┐  (core only)
     ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌───────────┐
│ browser │  │ golden  │  │ discovery │
└────┬────┘  └────┬────┘  └─────┬─────┘
     │            │             │
     └────────────┼─────────────┘
                  ▼
         @scenelock/harness              ← unified DSL + tiering
                  ▼
         examples/toy-canvas-app
```

---

## Tier model (ratified — tickets 06/07)

| Tier | Runtime | Determinism | Claims |
| --- | --- | --- | --- |
| **scene** | Node (+ WASM hosts later) | Seed + virtual clock + `StepLoopDriver` | Scene asserts, invariants — `*.test.ts` default |
| **browser** | Chromium via Playwright | Host step hook + `settled` + determinism pack | Full integration (DOM chrome + canvas) |
| **golden** | Pinned software raster | Scene + bit-exact RGBA | Visual claim (`tier: "golden"`) |
| **smoke** | Real Chromium | Real clock (no determinism pack); quarantined | Release-gate user truth — not PR default |

Heavy-path guard: `TierBudget` + `TierPromotionError` (no silent escalation).

---

## Phase 0 — Scaffold (done)

- [x] Monorepo (pnpm + strict TS ESM)
- [x] Core contracts + failure envelope JSON schema
- [x] Thin package stubs + one placeholder test each
- [x] Toy canvas host with retained model + adapter

---

## Wave 1 — Package implementations (done)

Commit `31605f2`. All packages implemented against frozen core; 118 tests green.

### `@scenelock/executor` (done)

- [x] `SeededRandom` / `SeedManager.derive`
- [x] Virtual clock + optional realm install
- [x] `run()` isolation + schedule-fuzz stub `exploreSeeds`
- [x] Step-loop controller (`stepN` / `stepUntil` with starvation cap)

### `@scenelock/scene` (done)

- [x] Hardened `SceneQuery` + fake adapter kit
- [x] `awaitSettled` + pointer targeting (`worldToScreen`)
- [x] Adapter conformance suite

### `@scenelock/browser` (done)

- [x] Playwright engine / session / harness
- [x] A11y-primary locator bridge + auto-wait
- [x] COOP/COEP helpers + failure envelopes

### `@scenelock/golden` (done)

- [x] Directory store + bit-exact compare + fingerprint drift
- [x] Pixel-level diff reports + failure envelope mapping

### `@scenelock/discovery` (done)

- [x] Walk generator (transition / path / random / …)
- [x] `WalkExecutor` seam + snapshot invariants
- [x] Declarative model + XState mapping guide (no xstate dep)

---

## Wave 2 — Core v2 + e2e proof (done)

- [x] Core v2: fold wave-1 friction into contracts
- [x] Toy canvas host rebuilt
- [x] Integration tests: flow, golden, discovery + undo/redo identity, seed replay

---

## Wave 3 — Unified harness + tiering (done)

- [x] `ExecutionTier` = `scene` \| `browser` \| `golden` \| `smoke`
- [x] `@scenelock/harness`: `createHarness` DSL (`ui` / `scene` / `user` / `clock` / `rng` / `step` / `settled` / `expect` / `golden`)
- [x] Filename convention + `tierFromFilename` + vitest helpers
- [x] `TierPromotionError` + `TierBudget` reporter
- [x] Toy e2e via harness (scene + golden)

---

## Remains

| Item | Notes |
| --- | --- |
| **Recorder** | Emit a11y-primary locators + scene ids; no structural by default |
| **CLI** | Seed flags, `--update` goldens, failure-envelope reporter, walk replay, tier budget gate |
| **Real host spikes** | Creator / tldraw (or similar) adapter + scene-tier suite |
| Optional | GitHub Actions matrix; browser-tier nightly; library `@scenelock/adapter-*` packages |

---

## Interface boundaries (cheat sheet)

| Concept | Defined in | Implemented in |
| --- | --- | --- |
| `FailureEnvelope`, locators, seeds, tiers | `core` | reporters / all tiers |
| `DeterministicExecutor`, `StepLoopDriver`, `VirtualClock` | `core` | `executor` |
| `SceneAdapter`, `SceneNode`, `RasterSurface` | `core` | host apps + `scene` kit |
| Unified `createHarness` DSL | `harness` | `harness` (composes executor/scene/browser/golden) |
| Core `Harness` (browser session) | `core` | `browser` |
| `BrowserEngine`, `BrowserSession` | `core` | `browser` |
| `StateModel`, walks, invariants | `core` | `discovery` |
| `GoldenCompare`, `RasterFrame`, `GoldenDiff` | `core` | `golden` |

---

## Out of scope (until map says otherwise)

- Multi-engine marketplace (Cypress/WDIO peers)
- CDP virtual time as Creator foundation
- Tolerance-based visual diffs
- Hypervisor-level determinism (rr / Antithesis)
- Publishing to npm (packaging shape TBD)
- Creator / tldraw / Stately product PRs (downstream adopters)
