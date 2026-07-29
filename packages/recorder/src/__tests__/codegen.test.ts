import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@scenelock/scene";
import { createRecorder } from "../recorder.js";
import { emitLog, emitTest } from "../codegen.js";
import { parseSession } from "../session.js";
import type { RecordingSession } from "../types.js";

function sampleSession(): RecordingSession {
  return {
    version: 1,
    metadata: {
      tier: "scene",
      seed: "demo",
      adapterContractVersion: "1",
      title: "box click",
    },
    actions: [
      {
        kind: "click",
        target: {
          kind: "scene",
          locator: { kind: "role", role: "rect", name: "Box" },
        },
        timestamp: 0,
      },
      {
        kind: "checkpoint",
        name: "after-click",
        timestamp: 0,
      },
      {
        kind: "click",
        target: {
          kind: "point",
          x: 12,
          y: 34,
          reason: "no-scene-match",
          flagged: true,
        },
        timestamp: 16,
      },
    ],
  };
}

describe("codegen", () => {
  it("emitTest produces harness DSL with tier filename + checkpoint stub", () => {
    const { source, filename, tier } = emitTest(sampleSession(), { basename: "flow" });
    expect(tier).toBe("scene");
    expect(filename).toBe("flow.test.ts");
    expect(source).toContain('from "@scenelock/harness"');
    expect(source).toContain('tier: "scene"');
    expect(source).toContain('seed: "demo"');
    expect(source).toContain('t.scene.getByRole("rect", { name: "Box" })');
    expect(source).toContain("await t.user.click(_t0)");
    expect(source).toContain("// checkpoint: after-click");
    expect(source).toContain('toPass(() => true, "checkpoint: after-click")');
    expect(source).toContain("// FLAG: raw-point fallback (no-scene-match)");
    expect(source).toContain("await clickPoint(deps.pointer, 12, 34)");
    expect(source).not.toContain("getByCss");
    expect(source).not.toContain("locator(");
  });

  it("emitTest is deterministic", () => {
    const a = emitTest(sampleSession()).source;
    const b = emitTest(sampleSession()).source;
    expect(a).toBe(b);
  });

  it("emitLog round-trips through parseSession", () => {
    const session = sampleSession();
    const json = emitLog(session);
    expect(parseSession(json)).toEqual(session);
  });

  it("browser tier suggests *.browser.test.ts and ui locators", () => {
    const session: RecordingSession = {
      version: 1,
      metadata: { tier: "browser", seed: "b1" },
      actions: [
        {
          kind: "click",
          target: {
            kind: "dom",
            locator: { kind: "role", role: "button", name: "Go", exact: true },
          },
          timestamp: 0,
        },
      ],
    };
    const { source, filename } = emitTest(session, { basename: "nav" });
    expect(filename).toBe("nav.browser.test.ts");
    expect(source).toContain('t.ui.getByRole("button", { name: "Go", exact: true })');
    expect(source).toContain("PageDriver");
  });

  it("generated source typechecks against workspace packages", () => {
    const { source } = emitTest(sampleSession(), { basename: "typecheck-flow" });
    const repoRoot = join(import.meta.dirname, "../../../..");
    const dir = mkdtempSync(join(tmpdir(), "scenelock-recorder-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
      writeFileSync(join(dir, "flow.ts"), source, "utf8");
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify(
          {
            extends: join(repoRoot, "tsconfig.base.json"),
            compilerOptions: {
              noEmit: true,
              baseUrl: repoRoot,
              paths: {
                "@scenelock/core": ["packages/core/src/index.ts"],
                "@scenelock/harness": ["packages/harness/src/index.ts"],
                "@scenelock/browser": ["packages/browser/src/index.ts"],
                "@scenelock/scene": ["packages/scene/src/index.ts"],
                "@scenelock/executor": ["packages/executor/src/index.ts"],
                "@scenelock/golden": ["packages/golden/src/index.ts"],
              },
            },
            include: ["flow.ts"],
          },
          null,
          2,
        ),
        "utf8",
      );
      execFileSync(join(repoRoot, "node_modules/.bin/tsc"), ["-p", join(dir, "tsconfig.json"), "--noEmit"], {
        stdio: "pipe",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("end-to-end: record scene click then emitTest", async () => {
    const adapter = createFakeAdapter([
      { id: "r1", role: "rect", name: "Box", bbox: { x: 0, y: 0, width: 20, height: 20 } },
    ]);
    const rec = createRecorder({
      adapter: { ...adapter, contractVersion: "toy-1" },
      tier: "scene",
      seed: "e2e",
    });
    await rec.feed({ type: "pointerdown", x: 10, y: 10, timestamp: 0, surface: "canvas" });
    await rec.feed({ type: "pointerup", x: 10, y: 10, timestamp: 10, surface: "canvas" });
    rec.checkpoint("done");
    await rec.flush();
    const { source, filename } = emitTest(rec.session());
    expect(filename).toBe("recorded.test.ts");
    expect(source).toContain('getByRole("rect", { name: "Box" })');
    expect(rec.session().metadata.adapterContractVersion).toBe("toy-1");
  });
});
