import { describe, expect, it } from "vitest";
import { failuresFromVitestJson, parseVitestJson } from "../vitest-json.js";

describe("vitest JSON → FailureEnvelope", () => {
  it("maps failed assertions with tier + artifact paths", () => {
    const report = parseVitestJson(`
noise before
{
  "success": false,
  "numTotalTests": 1,
  "numFailedTests": 1,
  "testResults": [
    {
      "name": "/repo/flow.golden.test.ts",
      "assertionResults": [
        {
          "fullName": "visual claim",
          "status": "failed",
          "duration": 12,
          "failureMessages": [
            "mismatch actual at ./goldens/.artifacts/actual.png expected ./goldens/.artifacts/expected.png diff ./goldens/.artifacts/diff.json"
          ]
        }
      ]
    }
  ]
}
`);
    const failures = failuresFromVitestJson(report, {
      seed: "s1",
      reportedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(failures).toHaveLength(1);
    const f = failures[0]!;
    expect(f.tier).toBe("golden");
    expect(f.seed).toBe("s1");
    expect(f.status).toBe("failed");
    expect(f.testId).toContain("visual claim");
    expect(f.artifacts.actualGolden).toMatch(/actual\.png$/);
    expect(f.artifacts.expectedGolden).toMatch(/expected\.png$/);
    expect(f.artifacts.goldenDiff).toMatch(/diff\.json$/);
  });
});
