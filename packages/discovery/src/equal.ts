/**
 * JSON-stable deep equality for abstract snapshots.
 *
 * Limits (document for callers):
 * - Only JSON-representable values compare meaningfully (`undefined` keys drop;
 *   `NaN` → `null`; `bigint`/functions/symbols throw or stringify poorly).
 * - Key order in objects is normalized (sorted) so `{a:1,b:2}` equals `{b:2,a:1}`.
 * - Does not handle cycles (throws).
 * - `Date` becomes ISO string via `JSON.stringify`; use plain data in snapshots.
 */

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortKeys(obj[k]);
  }
  return out;
}

/** Deep equality via canonical JSON. See {@link stableStringify} limits. */
export function jsonStableEqual(a: unknown, b: unknown): boolean {
  try {
    return stableStringify(a) === stableStringify(b);
  } catch {
    return false;
  }
}
