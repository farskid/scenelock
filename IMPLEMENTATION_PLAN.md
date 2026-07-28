# Scenelock — Implementation Plan

Phased plan for parallel coding agents. Each package is an independent work unit with explicit interface boundaries defined in `@scenelock/core`.

---

## Freeze rule (historical — wave 1)

Wave 1 ran under a core freeze. **Wave 2 lifted the freeze** for the integrator: core v2 contracts are ratified and packages consume them. Further core changes should still prefer small, deliberate RFCs — but the hard freeze table below is **done**.

| Path | Wave-1 status | Wave-2 status |
| --- | --- | --- |
| `packages/core/**` | FROZEN | **Open** (v2 landed) |
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
         examples/toy-canvas-app          ← e2e proof (wave 2)
```

---

## Tier model (do not reinvent)

| Tier | Runtime | Determinism source | Claims |
| --- | --- | --- | --- |
| **engine** | Node (+ WASM hosts later) | Seed + virtual clock + `StepLoopDriver` | Scene asserts, invariants |
| **golden** | Pinned software raster | Bit-exact RGBA + fingerprint | Visual claim (`tier: "golden"`) |
| **browser** | Chromium via Playwright | Host step hook + `settled`, not CDP VT | Full integration (DOM chrome + canvas), COOP/COEP for SAB |
| **virtual-time** | Optional CDP VT | Main-thread hosts only | Accelerator — **not** Creator default |

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

- [x] Core v2: fold wave-1 friction into contracts (`ExecutionTier.golden`, pixel `GoldenDiff`, timer `VirtualClock`, `stepN`/`stepUntil`, `runWithSeed` + failure-envelope hook, path/random coverage, `DiscoveryViolation` / `WalkExecutor`, `DeclarativeStateModel`, loosened `InvariantContext`, `extraHTTPHeaders`, SceneAdapter kit JSDoc)
- [x] Toy canvas host rebuilt: rect/ellipse, add/move/select/delete/undo/redo, software raster, tween `step(dt)`
- [x] Integration tests: flow, golden (committed `toy-raster-v1`), discovery + undo/redo identity, seed replay
- [x] Docs: README status + quickstart; this plan marked done

---

## Remains (post wave 2)

| Item | Notes |
| --- | --- |
| **Real host spikes** | Creator / tldraw (or similar) adapter + engine-tier suite |
| **Recorder** | Emit a11y-primary locators + scene ids; no structural by default |
| **CLI** | Seed flags, `--update` goldens, failure-envelope reporter, walk replay |
| Optional | GitHub Actions matrix; browser-tier nightly; library `@scenelock/adapter-*` packages |

---

## Interface boundaries (cheat sheet)

| Concept | Defined in | Implemented in |
| --- | --- | --- |
| `FailureEnvelope`, locators, DSL, seeds | `core` | reporters / all tiers |
| `DeterministicExecutor`, `StepLoopDriver`, `VirtualClock` | `core` | `executor` |
| `SceneAdapter`, `SceneNode`, `RasterSurface` | `core` | host apps + `scene` kit |
| `Harness`, `Expectation` | `core` | `browser` (+ future engine harness) |
| `BrowserEngine`, `BrowserSession` | `core` | `browser` |
| `StateModel`, `DeclarativeStateModel`, `Walk`, `Invariant`, `WalkExecutor`, `DiscoveryRunner` | `core` | `discovery` |
| `GoldenCompare`, `RasterFrame`, `GoldenDiff` | `core` | `golden` |

---

## Out of scope (until map says otherwise)

- Multi-engine marketplace (Cypress/WDIO peers)
- CDP virtual time as Creator foundation
- Tolerance-based visual diffs
- Hypervisor-level determinism (rr / Antithesis)
- Publishing to npm (packaging shape TBD)
- Creator / tldraw / Stately product PRs (downstream adopters)
