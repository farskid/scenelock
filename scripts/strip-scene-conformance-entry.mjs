/**
 * Post-tsc: keep vitest-backed conformance off the main `@scenelock/scene` entry.
 * Conformance remains available at `@scenelock/scene/conformance`.
 * (src still re-exports from index for in-repo DX via vitest aliases.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/scene/dist");

function stripJs(source) {
  return source
    .replace(
      /^export \{ createAdapterConformanceTests \} from "\.\/conformance\.js";\r?\n/m,
      "",
    )
    .replace(/^export \{\};\r?\n/m, "");
}

function stripDts(source) {
  return source
    .replace(
      /^export type \{ AdapterFactory, AdapterConformanceOptions \} from "\.\/conformance\.js";\r?\n/m,
      "",
    )
    .replace(
      /^export \{ createAdapterConformanceTests \} from "\.\/conformance\.js";\r?\n/m,
      "",
    );
}

const jsPath = path.join(root, "index.js");
const dtsPath = path.join(root, "index.d.ts");

const jsBefore = fs.readFileSync(jsPath, "utf8");
const dtsBefore = fs.readFileSync(dtsPath, "utf8");
const jsAfter = stripJs(jsBefore);
const dtsAfter = stripDts(dtsBefore);

if (jsAfter === jsBefore || dtsAfter === dtsBefore) {
  console.error(
    "strip-scene-conformance-entry: expected conformance re-exports in dist/index — pattern mismatch",
  );
  process.exit(1);
}

fs.writeFileSync(jsPath, jsAfter);
fs.writeFileSync(dtsPath, dtsAfter);
console.log("strip-scene-conformance-entry: removed conformance from main entry");
