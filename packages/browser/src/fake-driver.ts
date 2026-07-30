import type { BBox } from "@scenelock/core";
import type {
  DriverFillOptions,
  DriverLocator,
  DriverPoint,
  DriverTarget,
  DriverTypeOptions,
  PageDriver,
} from "./driver.js";
import { isDriverPoint } from "./driver.js";

/**
 * Scripted DOM-ish state for unit tests — no Playwright / browser required.
 */

export interface FakeElement {
  readonly id: string;
  readonly role?: string;
  readonly name?: string;
  readonly label?: string;
  readonly text?: string;
  readonly placeholder?: string;
  readonly alt?: string;
  readonly testId?: string;
  readonly css?: string;
  /** Become matchable after this many successful probe attempts (auto-wait tests). */
  readonly availableAfterPolls?: number;
  visible?: boolean;
  value?: string;
  bbox?: BBox;
  /** Invoked when the element is clicked / filled (test spies). */
  onClick?: () => void;
  onFill?: (value: string) => void;
}

export interface FakePageDriverOptions {
  readonly elements?: FakeElement[];
  /** Initial `crossOriginIsolated` flag returned from evaluate probes. */
  readonly crossOriginIsolated?: boolean;
  /** Optional page-side scene adapter callable from evaluate. */
  readonly pageSceneAdapter?: {
    contractVersion?: string;
    snapshot: () => unknown;
    locate: (id: string) => BBox | null;
    settled: () => Promise<void>;
    hitTest?: (point: { x: number; y: number }) => string | null;
  };
}

interface InternalElement extends FakeElement {
  /** Polls observed while this element was not yet available. */
  pollsSeen: number;
}

/**
 * In-memory {@link PageDriver} with scripted elements and poll counters.
 */
export class FakePageDriver implements PageDriver {
  private readonly elements: InternalElement[];
  private url = "about:blank";
  private closed = false;
  private headers: Record<string, string> = {};
  private crossOriginIsolated: boolean;
  private readonly pageSceneAdapter: FakePageDriverOptions["pageSceneAdapter"];
  /** Screenshot paths requested (pointers only). */
  readonly screenshotPaths: string[] = [];
  /** Recorded actions for assertions. */
  readonly actions: string[] = [];

  constructor(options: FakePageDriverOptions = {}) {
    this.elements = (options.elements ?? []).map((el) => ({
      ...el,
      pollsSeen: 0,
      visible: el.visible ?? true,
    }));
    this.crossOriginIsolated = options.crossOriginIsolated ?? false;
    this.pageSceneAdapter = options.pageSceneAdapter;
  }

  /** Test helper: mutate isolation flag mid-run. */
  setCrossOriginIsolated(value: boolean): void {
    this.crossOriginIsolated = value;
  }

  getExtraHTTPHeaders(): Readonly<Record<string, string>> {
    return this.headers;
  }

  getUrl(): string {
    return this.url;
  }

  async goto(url: string): Promise<void> {
    this.ensureOpen();
    this.url = url;
    this.actions.push(`goto:${url}`);
  }

  async click(target: DriverTarget): Promise<void> {
    this.ensureOpen();
    if (isDriverPoint(target)) {
      this.actions.push(`click:@${target.x},${target.y}`);
      return;
    }
    const el = this.requireMatch(target, "click");
    el.onClick?.();
    this.actions.push(`click:${el.id}`);
  }

  async dblclick(target: DriverTarget): Promise<void> {
    this.ensureOpen();
    if (isDriverPoint(target)) {
      this.actions.push(`dblclick:@${target.x},${target.y}`);
      return;
    }
    const el = this.requireMatch(target, "dblclick");
    el.onClick?.();
    this.actions.push(`dblclick:${el.id}`);
  }

  async hover(target: DriverTarget): Promise<void> {
    this.ensureOpen();
    if (isDriverPoint(target)) {
      this.actions.push(`hover:@${target.x},${target.y}`);
      return;
    }
    const el = this.requireMatch(target, "hover");
    this.actions.push(`hover:${el.id}`);
  }

  async fill(target: DriverLocator, value: string, options?: DriverFillOptions): Promise<void> {
    this.ensureOpen();
    const el = this.requireMatch(target, "fill");
    const next = options?.clear === false ? `${el.value ?? ""}${value}` : value;
    el.value = next;
    el.onFill?.(next);
    this.actions.push(`fill:${el.id}=${next}`);
  }

  async type(target: DriverLocator, text: string, options?: DriverTypeOptions): Promise<void> {
    this.ensureOpen();
    const el = this.requireMatch(target, "type");
    if (options?.clear !== false && options?.clear === true) {
      el.value = "";
    }
    el.value = `${el.value ?? ""}${text}`;
    this.actions.push(`type:${el.id}=${text}`);
  }

  async press(target: DriverLocator | "page", key: string): Promise<void> {
    this.ensureOpen();
    if (target === "page") {
      this.actions.push(`press:page:${key}`);
      return;
    }
    const el = this.requireMatch(target, "press");
    this.actions.push(`press:${el.id}:${key}`);
  }

  async evaluate<T, Arg = void>(fn: (arg: Arg) => T | Promise<T>, arg?: Arg): Promise<T> {
    this.ensureOpen();
    // Fake realm: run in Node with a scripted globalThis surface.
    const prev = globalThis as typeof globalThis & {
      crossOriginIsolated?: boolean;
      __scenelockScene?: FakePageDriverOptions["pageSceneAdapter"];
    };
    const hadIso = Object.prototype.hasOwnProperty.call(prev, "crossOriginIsolated");
    const prevIso = prev.crossOriginIsolated;
    const hadScene = Object.prototype.hasOwnProperty.call(prev, "__scenelockScene");
    const prevScene = prev.__scenelockScene;
    prev.crossOriginIsolated = this.crossOriginIsolated;
    if (this.pageSceneAdapter !== undefined) {
      prev.__scenelockScene = this.pageSceneAdapter;
    }
    try {
      return await fn(arg as Arg);
    } finally {
      if (hadIso && prevIso !== undefined) prev.crossOriginIsolated = prevIso;
      else delete prev.crossOriginIsolated;
      if (hadScene && prevScene !== undefined) prev.__scenelockScene = prevScene;
      else delete prev.__scenelockScene;
    }
  }

  async screenshot(path: string): Promise<string> {
    this.ensureOpen();
    this.screenshotPaths.push(path);
    this.actions.push(`screenshot:${path}`);
    return path;
  }

  async bbox(target: DriverLocator): Promise<BBox | null> {
    const el = this.match(target);
    if (el === null) return null;
    return el.bbox ?? { x: 0, y: 0, width: 10, height: 10 };
  }

  async isVisible(target: DriverLocator): Promise<boolean> {
    const el = this.match(target);
    return el !== null && el.visible !== false;
  }

  async isHidden(target: DriverLocator): Promise<boolean> {
    const el = this.match(target);
    return el === null || el.visible === false;
  }

  async textContent(target: DriverLocator): Promise<string | null> {
    const el = this.match(target);
    return el?.text ?? el?.name ?? null;
  }

  async inputValue(target: DriverLocator): Promise<string | null> {
    const el = this.match(target);
    return el?.value ?? null;
  }

  async count(target: DriverLocator): Promise<number> {
    return this.matchAll(target).length;
  }

  async setExtraHTTPHeaders(headers: Readonly<Record<string, string>>): Promise<void> {
    this.headers = { ...headers };
    this.actions.push(`headers:${Object.keys(headers).join(",")}`);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.actions.push("close");
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error("FakePageDriver: already closed");
  }

  private match(target: DriverLocator): InternalElement | null {
    const hits = this.matchAll(target);
    return hits[0] ?? null;
  }

  private matchAll(target: DriverLocator): InternalElement[] {
    const hits: InternalElement[] = [];
    for (const el of this.elements) {
      if (!this.matchesSelector(el, target)) continue;
      const need = el.availableAfterPolls ?? 0;
      if (el.pollsSeen < need) {
        el.pollsSeen += 1;
        continue;
      }
      hits.push(el);
    }
    return hits;
  }

  private requireMatch(target: DriverLocator, action: string): InternalElement {
    const el = this.match(target);
    if (el === null) {
      throw new Error(`FakePageDriver: no element for ${action} (${describeLocator(target)})`);
    }
    return el;
  }

  private matchesSelector(el: InternalElement, target: DriverLocator): boolean {
    switch (target.kind) {
      case "role":
        if (el.role !== target.role) return false;
        if (target.name === undefined) return true;
        return matchString(el.name ?? el.text ?? "", target.name, target.exact);
      case "label":
        return matchString(el.label ?? "", target.label, target.exact);
      case "text":
        return matchString(el.text ?? el.name ?? "", target.text, target.exact);
      case "placeholder":
        return matchString(el.placeholder ?? "", target.placeholder, target.exact);
      case "alt":
        return matchString(el.alt ?? "", target.alt, target.exact);
      case "testId":
        return el.testId === target.testId;
      case "css":
        return el.css === target.css;
      case "xpath":
        return el.css === target.xpath || el.id === target.xpath;
      default: {
        const _e: never = target;
        return _e;
      }
    }
  }
}

function matchString(actual: string, expected: string | RegExp, exact?: boolean): boolean {
  if (typeof expected === "string") {
    return exact === true ? actual === expected : actual.includes(expected);
  }
  return expected.test(actual);
}

function describeLocator(target: DriverLocator): string {
  return JSON.stringify(target, (_k, v: unknown) => (v instanceof RegExp ? v.toString() : v));
}

/** Convenience: click-at point type guard re-export for tests. */
export type { DriverPoint };
