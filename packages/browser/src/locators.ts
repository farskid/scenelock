import type { Locator, LocatorBridge, StructuralLocator } from "@scenelock/core";
import type { DriverLocator } from "./driver.js";

/**
 * Locator policy gate + translation to driver targets.
 * Ladder: role → label/text/placeholder/alt → testId; structural opt-in only.
 */

/** Structural shape used in denial errors (may lack allowStructural at runtime). */
export type StructuralLocatorLike = {
  readonly kind: "structural";
  readonly css?: string;
  readonly xpath?: string;
  readonly allowStructural?: boolean;
};

/** Thrown when a structural CSS/XPath locator is used without allowStructural. */
export class StructuralLocatorDeniedError extends Error {
  readonly locator: StructuralLocatorLike;

  constructor(locator: StructuralLocatorLike) {
    super(
      `Structural locators are denied by default (css=${locator.css ?? ""}, xpath=${locator.xpath ?? ""}). ` +
        `Pass allowStructural: true only as an explicit escape hatch — prefer role/label/text/testId.`,
    );
    this.name = "StructuralLocatorDeniedError";
    this.locator = locator;
  }
}

/**
 * Policy gate used by the Playwright locator bridge.
 * Structural locators without `allowStructural: true` throw.
 */
export function assertLocatorAllowed(locator: Locator): void {
  if (locator.kind === "structural" && locator.allowStructural !== true) {
    throw new StructuralLocatorDeniedError(locator);
  }
}

/**
 * Translate a core {@link Locator} into a {@link DriverLocator}.
 * Scene locators are not translated here — they resolve via SceneAdapter.locate.
 *
 * @throws {StructuralLocatorDeniedError} when structural CSS/XPath is refused
 * @throws {Error} when a scene locator is passed (caller must use scene path)
 */
export function translateLocator(locator: Locator): DriverLocator {
  assertLocatorAllowed(locator);

  switch (locator.kind) {
    case "role":
      if (locator.name !== undefined && locator.exact !== undefined) {
        return { kind: "role", role: locator.role, name: locator.name, exact: locator.exact };
      }
      if (locator.name !== undefined) {
        return { kind: "role", role: locator.role, name: locator.name };
      }
      if (locator.exact !== undefined) {
        return { kind: "role", role: locator.role, exact: locator.exact };
      }
      return { kind: "role", role: locator.role };
    case "label":
      return locator.exact !== undefined
        ? { kind: "label", label: locator.label, exact: locator.exact }
        : { kind: "label", label: locator.label };
    case "text":
      return locator.exact !== undefined
        ? { kind: "text", text: locator.text, exact: locator.exact }
        : { kind: "text", text: locator.text };
    case "placeholder":
      return locator.exact !== undefined
        ? { kind: "placeholder", placeholder: locator.placeholder, exact: locator.exact }
        : { kind: "placeholder", placeholder: locator.placeholder };
    case "alt":
      return locator.exact !== undefined
        ? { kind: "alt", alt: locator.alt, exact: locator.exact }
        : { kind: "alt", alt: locator.alt };
    case "testId":
      return { kind: "testId", testId: locator.testId };
    case "structural":
      return translateStructural(locator);
    case "scene":
      throw new Error(
        `Scene locator id=${locator.id} cannot be translated to a DOM driver locator; use scene.locate + coordinate click.`,
      );
    default: {
      const _exhaustive: never = locator;
      throw new Error(`Unknown locator kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function translateStructural(locator: StructuralLocator): DriverLocator {
  if (locator.css !== undefined && locator.css.length > 0) {
    return { kind: "css", css: locator.css };
  }
  if (locator.xpath !== undefined && locator.xpath.length > 0) {
    return { kind: "xpath", xpath: locator.xpath };
  }
  throw new Error(
    "Structural locator requires a non-empty css or xpath string when allowStructural is true.",
  );
}

/**
 * Factory for a translator used by LocatorBridge implementations.
 */
export function createLocatorTranslator(): {
  translate: typeof translateLocator;
  assertAllowed: typeof assertLocatorAllowed;
} {
  return { translate: translateLocator, assertAllowed: assertLocatorAllowed };
}

/** Type re-export for consumers wiring a custom bridge. */
export type { LocatorBridge };
