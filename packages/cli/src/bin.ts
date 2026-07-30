#!/usr/bin/env node
import { main } from "./main.js";

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(
      `scenelock: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
