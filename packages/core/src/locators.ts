/**
 * Locator policy (research 03 / 04):
 *   1. role (+ accessible name)
 *   2. label / text / placeholder / alt
 *   3. testId escape hatch
 *   4. scene id (canvas retained-model)
 * Structural CSS/XPath are opt-in and denied by default (lint + recorder).
 */

export type DomLocatorKind = "role" | "label" | "text" | "placeholder" | "alt" | "testId";

export interface RoleLocator {
  readonly kind: "role";
  readonly role: string;
  readonly name?: string | RegExp;
  readonly exact?: boolean;
}

export interface LabelLocator {
  readonly kind: "label";
  readonly label: string | RegExp;
  readonly exact?: boolean;
}

export interface TextLocator {
  readonly kind: "text";
  readonly text: string | RegExp;
  readonly exact?: boolean;
}

export interface PlaceholderLocator {
  readonly kind: "placeholder";
  readonly placeholder: string | RegExp;
  readonly exact?: boolean;
}

export interface AltLocator {
  readonly kind: "alt";
  readonly alt: string | RegExp;
  readonly exact?: boolean;
}

export interface TestIdLocator {
  readonly kind: "testId";
  readonly testId: string;
}

/** Canvas / retained-model locator — aims pointer events at real coordinates via scene.locate. */
export interface SceneLocator {
  readonly kind: "scene";
  readonly id: string;
}

/**
 * Escape hatch only. Harness lint/recorder must not emit this by default.
 * Require an explicit `allowStructural: true` at the call site.
 */
export interface StructuralLocator {
  readonly kind: "structural";
  readonly css?: string;
  readonly xpath?: string;
  readonly allowStructural: true;
}

export type DomLocator =
  | RoleLocator
  | LabelLocator
  | TextLocator
  | PlaceholderLocator
  | AltLocator
  | TestIdLocator;

export type Locator = DomLocator | SceneLocator | StructuralLocator;

export type LocatorPriority = readonly DomLocatorKind[];

/** Default a11y-primary → testId ladder. */
export const DEFAULT_LOCATOR_PRIORITY: LocatorPriority = [
  "role",
  "label",
  "text",
  "placeholder",
  "alt",
  "testId",
] as const;
