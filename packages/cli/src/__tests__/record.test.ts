import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSession } from "@scenelock/recorder";
import { recordCommand } from "../record.js";

const fixtureSession = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/session.json",
);

describe("record conversion", () => {
  it("emitTest writes harness DSL from fixture session JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "scenelock-record-"));
    const out = join(dir, "flow.test.ts");
    const log = join(dir, "flow.session.json");

    const result = recordCommand({
      command: "record",
      out,
      session: fixtureSession,
      log,
    });

    expect(result.exitCode).toBe(0);
    const source = readFileSync(out, "utf8");
    expect(source).toContain('from "@scenelock/harness"');
    expect(source).toContain('tier: "scene"');
    expect(source).toContain('seed: "cli-record-demo"');
    expect(source).toContain('t.scene.getByRole("rect", { name: "Box" })');
    expect(source).toContain("checkpoint: after-click");

    const logged = parseSession(readFileSync(log, "utf8"));
    expect(logged.metadata.seed).toBe("cli-record-demo");
    expect(logged.actions).toHaveLength(2);
  });

  it("rejects invalid session JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "scenelock-record-"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, '{"version":2}', "utf8");
    expect(() =>
      recordCommand({ command: "record", out: join(dir, "x.test.ts"), session: bad }),
    ).toThrow(/invalid RecordingSession/);
  });
});
