import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchPlaywrightDriver, type PlaywrightDriverHandle } from "@scenelock/browser";
import { attachRecorderSource } from "../event-source.js";
import { emitTest } from "../codegen.js";
import { createRecorder } from "../recorder.js";
import {
  createPlaywrightDomResolver,
  createPlaywrightRecorderEventSource,
} from "../playwright-source.js";

const enabled = process.env["SCENELOCK_REAL_BROWSER"] === "1";

const FIXTURE = `<!DOCTYPE html>
<html lang="en">
<body>
  <button type="button" id="save-btn">Save</button>
  <div id="status">idle</div>
  <script>
    document.getElementById("save-btn").addEventListener("click", function () {
      document.getElementById("status").textContent = "saved";
    });
  </script>
</body>
</html>`;

describe.runIf(enabled)("real Chromium recorder exposeBinding", () => {
  let server: http.Server;
  let url: string;
  let handle: PlaywrightDriverHandle;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(FIXTURE);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}/`;
    handle = await launchPlaywrightDriver({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await handle?.close();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("records a role-button click via exposeBinding + coalesces; emitTest typechecks", async () => {
    const page = handle.page as unknown as Parameters<
      typeof createPlaywrightRecorderEventSource
    >[0];
    const source = createPlaywrightRecorderEventSource(page);
    const domResolver = createPlaywrightDomResolver(page);
    const rec = createRecorder({
      domResolver,
      tier: "browser",
      seed: "rec-real-1",
      title: "save click",
    });

    // Bind before navigation so addInitScript installs on goto.
    const stop = await attachRecorderSource(rec, source);
    await handle.driver.goto(url);
    await handle.driver.click({ kind: "role", role: "button", name: "Save" });

    // exposeBinding is async — poll until coalesced click lands (no fixed sleep).
    const deadline = Date.now() + 5000;
    let click = rec.session().actions.find((a) => a.kind === "click");
    while (click === undefined && Date.now() < deadline) {
      await rec.flush();
      click = rec.session().actions.find((a) => a.kind === "click");
      if (click === undefined) {
        await new Promise<void>((r) => {
          setTimeout(r, 20);
        });
      }
    }
    await stop();

    expect(click).toBeDefined();
    expect(click).toMatchObject({
      kind: "click",
      target: {
        kind: "dom",
        locator: { kind: "role", role: "button", name: "Save" },
      },
    });

    const session = rec.session();
    const { source: emitted } = emitTest(session, { basename: "save-click" });
    expect(emitted).toContain('getByRole("button"');
    expect(emitted).toContain("Save");

    const repoRoot = join(import.meta.dirname, "../../../..");
    const dir = mkdtempSync(join(tmpdir(), "scenelock-rec-real-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
      writeFileSync(join(dir, "flow.ts"), emitted, "utf8");
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
});

describe.runIf(!enabled)("real Chromium recorder (skipped without SCENELOCK_REAL_BROWSER=1)", () => {
  it("skips cleanly when env gate is off", () => {
    expect(enabled).toBe(false);
  });
});
