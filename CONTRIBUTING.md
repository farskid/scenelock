# Contributing

## Setup

```bash
pnpm install
```

Node `>=20`, pnpm `9.15.9` (see root `packageManager`).

## Build

Emit ESM + `.d.ts` into each package's `dist/` (topo-sorted via pnpm):

```bash
pnpm build
# equivalent: pnpm -r --sort run build
```

Per package: `pnpm --filter @scenelock/<name> build` (uses `tsc -p tsconfig.json`).

## Test

```bash
pnpm test              # whole monorepo (vitest, aliases → packages/*/src)
pnpm -r test           # per-package vitest runs
pnpm test:watch        # watch mode
```

Vitest resolves `@scenelock/*` to **source** via root `vitest.config.ts` aliases — no build required for unit tests.

## Typecheck / lint / format

```bash
pnpm typecheck         # build (for dist exports) + root tsc --noEmit + per-package typecheck
pnpm lint
pnpm format:check
pnpm format
```

## Pack (consumer smoke)

```bash
pnpm build
for d in core executor scene browser golden discovery harness recorder; do
  (cd "packages/$d" && pnpm pack)
done
```

Install outside the repo with `file:` deps **and** matching `pnpm.overrides` (packed manifests rewrite `workspace:*` → `0.1.0`, so nested resolution needs overrides until npm publish):

```bash
REPO=/path/to/scenelock
SMOKE=$(mktemp -d /tmp/scenelock-pack-smoke.XXXXXX)
# Write package.json with dependencies + pnpm.overrides for
# core/executor/scene/browser/golden/harness → file:$REPO/packages/<name>/scenelock-<name>-0.1.0.tgz
cd "$SMOKE" && pnpm install
node --input-type=module -e '
import { createHarness } from "@scenelock/harness";
import { createFakeAdapter } from "@scenelock/scene";
const adapter = createFakeAdapter([{ id:"n1", role:"shape", name:"Box", bbox:{x:0,y:0,width:10,height:10} }]);
const t = await createHarness({ tier:"scene", adapter, seed:"pack-smoke-1" });
await t.expect(t.scene.getByRole("shape",{ name:"Box" })).toMatchScene({ role:"shape", name:"Box" });
await t.dispose();
console.log("SMOKE_OK");
'
```

## Package layout

| Field | Value |
| --- | --- |
| `exports["."].types` | `./dist/index.d.ts` |
| `exports["."].import` | `./dist/index.js` |
| `files` | `["dist"]` |
| Internal deps | `workspace:*` (rewritten on pack/publish) |

`@scenelock/scene/conformance` is a separate export (vitest peer). The main scene entry is stripped of that re-export at build time so scene-tier consumers do not load vitest.
