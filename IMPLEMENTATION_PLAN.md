# Scenelock — Implementation Plan

Phased plan for parallel coding agents. Each package is an independent work unit with explicit interface boundaries defined in `@scenelock/core`.

---

## Freeze rule (read first)

After this scaffold lands on `main`:

| Path | Status |
| --- | --- |
| `packages/core/**` | **FROZEN** — contracts only change via a dedicated core-RFC PR |
| Root configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `LICENSE`) | **FROZEN** |
| `IMPLEMENTATION_PLAN.md`, `README.md` | Amend only in docs PRs |
| `packages/{executor,scene,browser,discovery,golden}/**` | Owned by the agent assigned that package |
| `examples/toy-canvas-app/**` | Integration owner (phase 4); others may **read** only |

**Do not** edit another package's files. Depend on published workspace types from `@scenelock/core` only. If a contract gap blocks you, open a core-RFC note — do not silently widen types in your package.

---

## Dependency graph

```
                    ┌──────────────┐
                    │ @scenelock/  │
                    │    core      │  ← FROZEN contracts
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               │
   ┌──────────────┐ ┌──────────────┐       │
   │  executor    │ │    scene     │       │   phase 1 (parallel)
   └──────┬───────┘ └──────┬───────┘       │
          │                │               │
          └────────┬───────┘               │
                   ▼                       ▼
     ┌─────────────┼─────────────┐  (core only)
     ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌───────────┐
│ browser │  │ golden  │  │ discovery │   phase 2 (parallel)
└────┬────┘  └────┬────┘  └─────┬─────┘
     │            │             │
     └────────────┼─────────────┘
                  ▼
         examples/toy-canvas-app          phase 3
                  ▼
         integration / CI recipe          phase 4
```

**Order:** `core` (done) → `executor` ∥ `scene` → `browser` ∥ `golden` ∥ `discovery` → `examples` → integration.

---

## Tier model (do not reinvent)

| Tier | Runtime | Determinism source | Claims |
| --- | --- | --- | --- |
| **engine** | Node (+ WASM hosts later) | Seed + virtual clock + `StepLoopDriver` | Scene asserts, invariants, bit-exact goldens from software raster |
| **browser** | Chromium via Playwright | Host step hook + `settled`, not CDP VT | Full integration (DOM chrome + canvas), COOP/COEP for SAB |
| **virtual-time** | Optional CDP VT | Main-thread hosts only | Accelerator — **not** Creator default |

---

## Phase 0 — Scaffold (done)

- [x] Monorepo (pnpm + strict TS ESM)
- [x] Core contracts + failure envelope JSON schema
- [x] Thin package stubs + one placeholder test each
- [x] Toy canvas host with retained model + adapter

---

## Phase 1 — Executor & Scene (parallel)

### Work unit A: `@scenelock/executor`

**Owns:** `packages/executor/**`  
**Imports:** `@scenelock/core` only  
**Must not touch:** scene, browser, discovery, golden, examples

| Task | Acceptance |
| --- | --- |
| Implement `SeededRandom` (mulberry32 or equivalent) from `Seed.numeric` | Same seed → identical `next()` sequence across runs/processes |
| `SeedManager.derive(parent, label)` stable child seeds | `derive(a,"walk-1")` equals across machines |
| Optional realm install: patch `Date.now` / `performance.now` behind `clock.install()` | Documented; off by default in browser tier |
| `run()` isolates clock/random per invocation | Concurrent `run` calls do not share mutable clock state (create per-run clock copy or throw) |
| Schedule-fuzz stub: `exploreSeeds(base, n)` API returning seed list | Unit tests only; no host required |
| Export factory + tests | `pnpm --filter @scenelock/executor test` green; typecheck green |

### Work unit B: `@scenelock/scene`

**Owns:** `packages/scene/**`  
**Imports:** `@scenelock/core` only  
**Must not touch:** executor, browser, discovery, golden, examples

| Task | Acceptance |
| --- | --- |
| Harden `SceneQuery` (regex name, state predicates) | Tests cover role/name/id/state |
| Adapter test kit: `createFakeAdapter(nodes)` | Used by other packages' unit tests via public export |
| Settledness helpers: timeout + error type wrapping `adapter.settled()` | Rejects with structured message on timeout |
| Optional `RasterSurface` adapter helper | Thin wrap; no image I/O |
| Docs comment: library-adapter distribution story (`@scenelock/adapter-*` later) | README section in package or root pointer |

---

## Phase 2 — Browser, Golden, Discovery (parallel)

### Work unit C: `@scenelock/browser`

**Owns:** `packages/browser/**`  
**Imports:** `@scenelock/core` (+ peer `playwright`)  
**May read:** scene types from core only (bind `SceneAdapter` from page)  
**Must not touch:** executor internals, discovery, golden, examples

| Task | Acceptance |
| --- | --- |
| Wrap `playwright` chromium launch/context/page | `newSession` returns working `BrowserSession` |
| Implement `Harness` / `LocatorBridge` with a11y-primary policy | role → label/text → testId; structural throws unless `allowStructural` |
| Auto-wait + web-first expects (poll until timeout) | No `waitForTimeout` in public API |
| `goto` + COOP/COEP fixture headers helper | `crossOriginIsolated` assert helper exported |
| Bind page-exposed scene adapter (`bindScene`) | `getBySceneId` aims real pointer at `locate()` bbox center |
| Failure → `FailureEnvelope` (seed, tier:`browser`, artifact paths) | JSON matches `FAILURE_ENVELOPE_JSON_SCHEMA` required keys |
| Headless default | Headed opt-in only |

### Work unit D: `@scenelock/golden`

**Owns:** `packages/golden/**`  
**Imports:** `@scenelock/core`  
**Must not touch:** other packages

| Task | Acceptance |
| --- | --- |
| Filesystem `GoldenStore` (PNG or raw RGBA — pick one, document) | Read/write round-trip |
| Bit-exact `compare` + optional diff PNG on mismatch | `verdict` discriminates match/mismatch/dimensions/missing |
| `--update` path via `options.update` | Missing baseline written only when update=true |
| Document rasterizer pin in package README | Copies/extends `RASTERIZER_ASSUMPTIONS`; no tolerance API |

### Work unit E: `@scenelock/discovery`

**Owns:** `packages/discovery/**`  
**Imports:** `@scenelock/core`  
**Must not touch:** browser/golden/examples (executor used only via `ExecutorContext` / `Harness` interfaces)

| Task | Acceptance |
| --- | --- |
| Walk generator meeting `transition` + `walk-count` criteria | Coverage report numbers sane on toy model |
| `DiscoveryRunner.runWalk` applies events through a supplied `applyEvent` hook | Invariants run after every step |
| Ship 2 sample invariants: `undoRedoIdentity`, `snapshotStable` (over scene snapshot) | Unit-tested with fake harness |
| XState v5 interop adapter (optional thin) | Maps machine → `StateModel` **or** document deferral |
| Failed walks emit seeds in `DiscoveryReport.failedSeeds` | Replay token list non-empty on forced fail |

---

## Phase 3 — Example host

### Work unit F: `examples/toy-canvas-app`

**Owns:** `examples/toy-canvas-app/**`  
**Imports:** core, executor, scene, golden, discovery (and browser later)

| Task | Acceptance |
| --- | --- |
| Keep adapter in one file (adoption demo) | `createToySceneAdapter` remains the sole adapter surface |
| Engine-tier tests: scene locate + step loop + invariant walk | Vitest green without Playwright |
| Golden test against `app.render()` | Bit-exact under software path |
| Minimal DOM shell (optional) for browser-tier smoke | Only after browser package lands |

---

## Phase 4 — Integration

**Owner:** integration agent (may touch root CI only; still not core contracts)

| Task | Acceptance |
| --- | --- |
| Root script `pnpm test` runs all package tests | CI-ready |
| GitHub Actions: Node 20, pnpm cache, Chromium install optional job | PR gate = engine-tier; browser job optional/nightly at first |
| JSON failure reporter wiring | One envelope schema both tiers |
| CONTRIBUTING.md: freeze rule + package ownership | Linked from README |

---

## Interface boundaries (cheat sheet)

| Concept | Defined in | Implemented in |
| --- | --- | --- |
| `FailureEnvelope`, locators, DSL, seeds | `core` | reporters / all tiers |
| `DeterministicExecutor`, `StepLoopDriver`, `VirtualClock` | `core` | `executor` |
| `SceneAdapter`, `SceneNode`, `RasterSurface` | `core` | host apps + `scene` kit |
| `Harness`, `Expectation` | `core` | `browser` (+ future engine harness) |
| `BrowserEngine`, `BrowserSession` | `core` | `browser` |
| `StateModel`, `Walk`, `Invariant`, `DiscoveryRunner` | `core` | `discovery` |
| `GoldenCompare`, `RasterFrame` | `core` | `golden` |

---

## Out of scope (until map says otherwise)

- Multi-engine marketplace (Cypress/WDIO peers)
- CDP virtual time as Creator foundation
- Tolerance-based visual diffs
- Hypervisor-level determinism (rr / Antithesis)
- Publishing to npm (packaging shape TBD)
- Creator / tldraw / Stately product PRs (downstream adopters)

---

## Agent assignment template

```
Package: @scenelock/<name>
Branch:  feat/<name>-<short-goal>
Allowed paths: packages/<name>/**
Forbidden: packages/core/**, root configs, other packages
Contracts: import types from @scenelock/core only
Done when: acceptance table rows checked + vitest green + typecheck green
```
