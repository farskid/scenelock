export const VERSION = "0.1.0";

export function printHelp(topic?: string): void {
  const general = `scenelock ${VERSION} — deterministic UI testing CLI

Usage:
  scenelock run [globs...] [options]
  scenelock replay --seed <s> [globs...] [options]
  scenelock budget --report <vitest-json> [--budget browser+smoke=<ratio>]
  scenelock record --out <file.test.ts> --session <session.json> [--log <file>]

Env (set by CLI; consumers must honor):
  SCENELOCK_SEED     pinned seed for replay (createHarness should default from this — see README)
  UPDATE_GOLDENS=1   request golden baseline updates in host tests
`;

  if (topic === "run" || topic === undefined) {
    process.stdout.write(
      general +
        `
run options:
  --tier <scene|browser|golden|smoke>   include globs from filename convention
  --seed <s>                            set SCENELOCK_SEED
  --update-goldens                      set UPDATE_GOLDENS=1
  --budget browser+smoke=<ratio>        fail when heavy-tier ratio exceeds budget
  --reporter json|line                  default: line (json emits Scenelock summary)
  --json-file <path>                    write summary JSON to path
`,
    );
    return;
  }

  if (topic === "replay") {
    process.stdout.write(`scenelock replay --seed <s> [globs...]

Pins SCENELOCK_SEED and runs once. Prints a reproduction command on stderr.
`);
    return;
  }

  if (topic === "budget") {
    process.stdout.write(`scenelock budget --report <vitest-json> [--budget browser+smoke=<ratio>]

CI gate: tierFromFilename distribution + TierBudget ratios (default ratio 0.35).
Exit 1 on violation.
`);
    return;
  }

  if (topic === "record") {
    process.stdout.write(`scenelock record --out <file.test.ts> --session <session.json> [--log <file>]

Offline codegen from a RecordingSession JSON (parseSession + emitTest).
Capture stays in-app; CLI only converts sessions to harness DSL files.
`);
    return;
  }

  process.stdout.write(general);
}
