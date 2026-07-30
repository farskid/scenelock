import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { emitLog, emitTest, parseSession } from "@scenelock/recorder";
import type { RecordArgs } from "./parse-args.js";

export interface RecordCommandResult {
  readonly exitCode: number;
  readonly outPath: string;
  readonly logPath?: string;
  readonly source: string;
  readonly suggestedFilename: string;
}

/**
 * Offline codegen: parseSession + emitTest → write `--out`.
 * Optional `--log` writes emitLog JSON.
 */
export function recordCommand(args: RecordArgs): RecordCommandResult {
  const json = readFileSync(args.session, "utf8");
  const session = parseSession(json);

  const outBase = basename(args.out, extname(args.out));
  // Strip tier suffixes from basename hint if present.
  const basenameHint = outBase
    .replace(/\.browser\.test$/i, "")
    .replace(/\.golden\.test$/i, "")
    .replace(/\.smoke\.test$/i, "")
    .replace(/\.test$/i, "");

  const { source, filename } = emitTest(session, { basename: basenameHint });

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, source, "utf8");

  let logPath: string | undefined;
  if (args.log !== undefined) {
    mkdirSync(dirname(args.log), { recursive: true });
    writeFileSync(args.log, emitLog(session), "utf8");
    logPath = args.log;
  }

  return {
    exitCode: 0,
    outPath: args.out,
    ...(logPath !== undefined ? { logPath } : {}),
    source,
    suggestedFilename: filename,
  };
}
