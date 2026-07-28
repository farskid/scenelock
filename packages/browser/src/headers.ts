import type { PageDriver } from "./driver.js";

/**
 * COOP/COEP fixture helpers for SharedArrayBuffer hosts (ticket 12).
 * Test servers must serve these; the browser tier can also set them as
 * extra HTTP headers on the context when the host cooperates.
 */

/** Headers required for SAB / cross-origin isolation (Creator integration tier). */
export const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
} as const;

export type CrossOriginIsolationHeaders = typeof CROSS_ORIGIN_ISOLATION_HEADERS;

/**
 * Apply COOP/COEP headers to the driver context for subsequent navigations.
 * Prefer serving them from the test server; this is a harness convenience.
 */
export async function applyCrossOriginIsolationHeaders(driver: PageDriver): Promise<void> {
  await driver.setExtraHTTPHeaders({ ...CROSS_ORIGIN_ISOLATION_HEADERS });
}

/**
 * Assert `window.crossOriginIsolated === true` in the page.
 * @throws {Error} when the page is not cross-origin isolated
 */
export async function assertCrossOriginIsolated(driver: PageDriver): Promise<void> {
  const isolated = await driver.evaluate(() => {
    return (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  }, undefined);
  if (!isolated) {
    throw new Error(
      "Expected crossOriginIsolated === true. Serve COOP: same-origin and COEP: require-corp " +
        `(see CROSS_ORIGIN_ISOLATION_HEADERS).`,
    );
  }
}
