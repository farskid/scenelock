import type { DomLocator, ExecutionTier } from "@scenelock/core";
import { TIER_FILENAME_SUFFIX } from "@scenelock/harness";
import { serializeSession } from "./session.js";
import type {
  RecordedAction,
  RecordedTarget,
  RecordingSession,
} from "./types.js";

export interface EmitTestOptions {
  /** Test / describe title. Default: session metadata title or "recorded flow". */
  readonly title?: string;
  /** Basename without tier suffix (e.g. "login"). Default: "recorded". */
  readonly basename?: string;
  /** Variable name for the harness handle. Default: "t". */
  readonly harnessVar?: string;
}

export interface EmitTestResult {
  /** Generated `.test.ts` source. */
  readonly source: string;
  /** Suggested filename including tier suffix (e.g. `recorded.browser.test.ts`). */
  readonly filename: string;
  readonly tier: ExecutionTier;
}

function escapeString(value: string): string {
  return JSON.stringify(value);
}

function emitDomLocatorExpr(locator: DomLocator, harnessVar: string): string {
  const ui = `${harnessVar}.ui`;
  switch (locator.kind) {
    case "role": {
      const opts: string[] = [];
      if (locator.name !== undefined) {
        opts.push(`name: ${typeof locator.name === "string" ? escapeString(locator.name) : locator.name.toString()}`);
      }
      if (locator.exact !== undefined) {
        opts.push(`exact: ${locator.exact}`);
      }
      return opts.length > 0
        ? `${ui}.getByRole(${escapeString(locator.role)}, { ${opts.join(", ")} })`
        : `${ui}.getByRole(${escapeString(locator.role)})`;
    }
    case "label": {
      const label =
        typeof locator.label === "string"
          ? escapeString(locator.label)
          : locator.label.toString();
      return locator.exact !== undefined
        ? `${ui}.getByLabel(${label}, { exact: ${locator.exact} })`
        : `${ui}.getByLabel(${label})`;
    }
    case "text": {
      const text =
        typeof locator.text === "string"
          ? escapeString(locator.text)
          : locator.text.toString();
      return locator.exact !== undefined
        ? `${ui}.getByText(${text}, { exact: ${locator.exact} })`
        : `${ui}.getByText(${text})`;
    }
    case "placeholder": {
      const ph =
        typeof locator.placeholder === "string"
          ? escapeString(locator.placeholder)
          : locator.placeholder.toString();
      return locator.exact !== undefined
        ? `${ui}.getByPlaceholder(${ph}, { exact: ${locator.exact} })`
        : `${ui}.getByPlaceholder(${ph})`;
    }
    case "alt":
      // Harness UiSurface has no getByAlt — fall through via role img + name when possible.
      return `${ui}.getByRole("img", { name: ${
        typeof locator.alt === "string" ? escapeString(locator.alt) : locator.alt.toString()
      } })`;
    case "testId":
      return `${ui}.getByTestId(${escapeString(locator.testId)})`;
    default: {
      const _e: never = locator;
      throw new Error(`Unsupported DOM locator: ${JSON.stringify(_e)}`);
    }
  }
}

function emitTargetExpr(
  target: RecordedTarget,
  harnessVar: string,
  bindName: string,
): { bind?: string; expr: string; flagComment?: string } {
  switch (target.kind) {
    case "dom":
      return {
        bind: `const ${bindName} = ${emitDomLocatorExpr(target.locator, harnessVar)};`,
        expr: bindName,
      };
    case "scene": {
      if (target.locator.kind === "role") {
        const opts =
          target.locator.name !== undefined
            ? `, { name: ${escapeString(target.locator.name)} }`
            : "";
        return {
          bind: `const ${bindName} = ${harnessVar}.scene.getByRole(${escapeString(target.locator.role)}${opts});`,
          expr: bindName,
        };
      }
      return {
        bind: `const ${bindName} = ${harnessVar}.scene.getBySceneId(${escapeString(target.locator.id)});`,
        expr: bindName,
      };
    }
    case "point":
      return {
        flagComment: `// FLAG: raw-point fallback (${target.reason}) — canvas.at(${target.x}, ${target.y})`,
        expr: `canvas.at(${target.x}, ${target.y})`,
      };
    default: {
      const _e: never = target;
      throw new Error(`Unsupported target: ${JSON.stringify(_e)}`);
    }
  }
}

function needsUi(session: RecordingSession): boolean {
  return session.actions.some((a) => {
    if (a.kind === "click" || a.kind === "dblclick" || a.kind === "type") {
      return a.target.kind === "dom";
    }
    if (a.kind === "drag") {
      return a.from.kind === "dom" || a.to.kind === "dom";
    }
    return false;
  });
}

function needsPointer(session: RecordingSession): boolean {
  return session.actions.some((a) => {
    if (a.kind === "click" || a.kind === "dblclick" || a.kind === "type") {
      return a.target.kind === "point";
    }
    if (a.kind === "drag") {
      return a.from.kind === "point" || a.to.kind === "point";
    }
    return false;
  });
}

function emitActionLines(
  action: RecordedAction,
  harnessVar: string,
  counter: { n: number },
): string[] {
  const nextBind = (): string => {
    const name = `_t${counter.n}`;
    counter.n += 1;
    return name;
  };

  switch (action.kind) {
    case "checkpoint":
      return [
        ``,
        `// checkpoint: ${action.name}`,
        `await ${harnessVar}.expect(() => true).toPass(() => true, ${escapeString(`checkpoint: ${action.name}`)});`,
      ];
    case "press":
      return [`await ${harnessVar}.user.press(${escapeString(action.key)});`];
    case "click":
    case "dblclick": {
      const bind = nextBind();
      const resolved = emitTargetExpr(action.target, harnessVar, bind);
      const lines: string[] = [];
      if (resolved.flagComment !== undefined) lines.push(resolved.flagComment);
      if (resolved.bind !== undefined) lines.push(resolved.bind);
      lines.push(`await ${harnessVar}.user.${action.kind}(${resolved.expr});`);
      return lines;
    }
    case "type": {
      const bind = nextBind();
      const resolved = emitTargetExpr(action.target, harnessVar, bind);
      const lines: string[] = [];
      if (resolved.flagComment !== undefined) lines.push(resolved.flagComment);
      if (resolved.bind !== undefined) lines.push(resolved.bind);
      lines.push(
        `await ${harnessVar}.user.type(${resolved.expr}, ${escapeString(action.text)});`,
      );
      return lines;
    }
    case "drag": {
      const fromBind = nextBind();
      const toBind = nextBind();
      const from = emitTargetExpr(action.from, harnessVar, fromBind);
      const to = emitTargetExpr(action.to, harnessVar, toBind);
      const lines: string[] = [];
      if (from.flagComment !== undefined) lines.push(from.flagComment);
      if (from.bind !== undefined) lines.push(from.bind);
      if (to.flagComment !== undefined) lines.push(to.flagComment);
      if (to.bind !== undefined) lines.push(to.bind);
      lines.push(`await ${harnessVar}.user.drag(${from.expr}, ${to.expr});`);
      return lines;
    }
    default: {
      const _e: never = action;
      throw new Error(`Unsupported action: ${JSON.stringify(_e)}`);
    }
  }
}

/**
 * Emit a deterministic `.test.ts` source string using the `createHarness` DSL.
 * One flow per session; checkpoints become assertion stubs.
 */
export function emitTest(
  session: RecordingSession,
  options: EmitTestOptions = {},
): EmitTestResult {
  const tier = session.metadata.tier;
  const basename = options.basename ?? "recorded";
  const filename = `${basename}${TIER_FILENAME_SUFFIX[tier]}`;
  const title = options.title ?? session.metadata.title ?? "recorded flow";
  const harnessVar = options.harnessVar ?? "t";
  const seed = session.metadata.seed ?? "recorded";
  const useUi = needsUi(session) || tier === "browser" || tier === "smoke";
  /** Scene / golden tiers need a pointer sink for `t.user` without a driver. */
  const usePointer = needsPointer(session) || !useUi;
  const hasRawPoints = needsPointer(session);

  const counter = { n: 0 };
  const bodyLines: string[] = [];
  for (const action of session.actions) {
    bodyLines.push(...emitActionLines(action, harnessVar, counter));
  }

  const depsFields: string[] = ["adapter: SceneAdapter"];
  if (usePointer) depsFields.push("pointer: PointerSink");
  if (useUi) depsFields.push("driver: PageDriver");

  const harnessOpts: string[] = [
    `tier: ${escapeString(tier)}`,
    `seed: ${escapeString(seed)}`,
    `adapter: deps.adapter`,
  ];
  if (usePointer) harnessOpts.push(`pointer: deps.pointer`);
  if (useUi) harnessOpts.push(`driver: deps.driver`);

  const imports = [
    `import { createHarness${usePointer ? ", type PointerSink" : ""} } from "@scenelock/harness";`,
    `import type { SceneAdapter } from "@scenelock/core";`,
  ];
  if (useUi) {
    imports.push(`import type { PageDriver } from "@scenelock/browser";`);
  }

  const canvasHelper = hasRawPoints
    ? [
        ``,
        `/** Raw-point fallback from the recorder — flagged coordinate target. */`,
        `async function clickPoint(pointer: PointerSink, x: number, y: number): Promise<void> {`,
        `  await pointer.click(x, y);`,
        `}`,
      ]
    : [];

  // When raw points appear, rewrite user.click(canvas.at(...)) into pointer calls for typecheck.
  const rewrittenBody = bodyLines.map((line) => {
    const clickMatch = line.match(
      /^await (\w+)\.user\.(click|dblclick)\(canvas\.at\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)\);$/,
    );
    if (clickMatch) {
      const [, , kind, x, y] = clickMatch;
      if (kind === "dblclick") {
        return `await clickPoint(deps.pointer, ${x}, ${y});\n  await clickPoint(deps.pointer, ${x}, ${y});`;
      }
      return `await clickPoint(deps.pointer, ${x}, ${y});`;
    }
    const typeMatch = line.match(
      /^await (\w+)\.user\.type\(canvas\.at\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\), (.+)\);$/,
    );
    if (typeMatch) {
      const text = typeMatch[4]!;
      return `await deps.pointer.type?.(${text});`;
    }
    const dragMatch = line.match(
      /^await (\w+)\.user\.drag\(canvas\.at\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\), canvas\.at\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)\);$/,
    );
    if (dragMatch) {
      const [, , x1, y1, x2, y2] = dragMatch;
      return `await deps.pointer.drag?.({ x: ${x1}, y: ${y1} }, { x: ${x2}, y: ${y2} });`;
    }
    // Mixed drag (one point) — leave as-is only if both are handles; otherwise pointer.
    return line;
  });

  const source = [
    `/**`,
    ` * Generated by @scenelock/recorder — non-interactive codegen.`,
    ` * Do not hand-edit the action sequence; re-record or patch the machine log.`,
    ` */`,
    ...imports,
    ...canvasHelper,
    ``,
    `export interface RecordedFlowDeps {`,
    ...depsFields.map((f) => `  ${f};`),
    `}`,
    ``,
    `/** One recorded flow — wire host adapter / pointer / driver via deps. */`,
    `export async function recordedFlow(deps: RecordedFlowDeps): Promise<void> {`,
    `  const ${harnessVar} = await createHarness({`,
    ...harnessOpts.map((o) => `    ${o},`),
    `  });`,
    `  try {`,
    ...rewrittenBody.map((l) => (l.length === 0 ? `` : `    ${l}`)),
    `  } finally {`,
    `    await ${harnessVar}.dispose();`,
    `  }`,
    `}`,
    ``,
    `export const recordedFlowTitle = ${escapeString(title)};`,
    ``,
  ].join("\n");

  return { source, filename, tier };
}

/** Machine-readable session JSON (files + log, never Inspector-copy). */
export function emitLog(session: RecordingSession): string {
  return serializeSession(session);
}
