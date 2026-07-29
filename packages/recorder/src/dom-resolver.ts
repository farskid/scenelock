import { bboxContains, type DomLocator } from "@scenelock/core";
import type { DomElementInfo, DomResolver } from "./types.js";

export interface FakeDomElement extends DomElementInfo {
  readonly id: string;
  readonly bbox: { x: number; y: number; width: number; height: number };
}

/**
 * In-memory {@link DomResolver} for unit tests — mirrors FakePageDriver element facts.
 */
export function createFakeDomResolver(elements: readonly FakeDomElement[]): DomResolver {
  const list = [...elements];

  const matches = (el: FakeDomElement, locator: DomLocator): boolean => {
    switch (locator.kind) {
      case "role": {
        if (el.role !== locator.role) return false;
        if (locator.name === undefined) return true;
        const actual = el.name ?? el.text ?? "";
        if (typeof locator.name === "string") {
          return locator.exact === false
            ? actual.includes(locator.name)
            : actual === locator.name;
        }
        return locator.name.test(actual);
      }
      case "label": {
        const actual = el.label ?? "";
        if (typeof locator.label === "string") {
          return locator.exact === false
            ? actual.includes(locator.label)
            : actual === locator.label;
        }
        return locator.label.test(actual);
      }
      case "text": {
        const actual = el.text ?? el.name ?? "";
        if (typeof locator.text === "string") {
          return locator.exact === false
            ? actual.includes(locator.text)
            : actual === locator.text;
        }
        return locator.text.test(actual);
      }
      case "placeholder": {
        const actual = el.placeholder ?? "";
        if (typeof locator.placeholder === "string") {
          return locator.exact === false
            ? actual.includes(locator.placeholder)
            : actual === locator.placeholder;
        }
        return locator.placeholder.test(actual);
      }
      case "alt": {
        const actual = el.alt ?? "";
        if (typeof locator.alt === "string") {
          return locator.exact === false
            ? actual.includes(locator.alt)
            : actual === locator.alt;
        }
        return locator.alt.test(actual);
      }
      case "testId":
        return el.testId === locator.testId;
      default: {
        const _e: never = locator;
        return _e;
      }
    }
  };

  return {
    atPoint(x: number, y: number): DomElementInfo | null {
      // Top-most = last containing element.
      for (let i = list.length - 1; i >= 0; i--) {
        const el = list[i]!;
        if (bboxContains(el.bbox, x, y)) {
          return el;
        }
      }
      return null;
    },
    count(locator: DomLocator): number {
      return list.filter((el) => matches(el, locator)).length;
    },
  };
}
