import { describe, expect, it } from "vitest";
import {
  CROSS_ORIGIN_ISOLATION_HEADERS,
  StructuralLocatorDeniedError,
  assertLocatorAllowed,
  createBrowserEngine,
} from "../index.js";

describe("@scenelock/browser", () => {
  it("denies structural locators without allowStructural", () => {
    expect(() =>
      assertLocatorAllowed({ kind: "structural", css: ".foo", allowStructural: true }),
    ).not.toThrow();
    // Malformed locator that bypassed the type system.
    expect(() =>
      assertLocatorAllowed({ kind: "structural", css: ".foo" } as never),
    ).toThrow(StructuralLocatorDeniedError);
    expect(CROSS_ORIGIN_ISOLATION_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(createBrowserEngine).toBeTypeOf("function");
  });
});
