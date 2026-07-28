/**
 * Virtual clock owned by the deterministic executor.
 * Hosts that own their rAF use step-driven loops; CDP virtual time is an
 * optional accelerator for main-thread hosts only (ticket 12).
 */

export interface VirtualClock {
  /** Current virtual time in milliseconds since epoch-or-zero (harness-defined origin). */
  now(): number;
  /** Advance virtual time by deltaMs without running host work. */
  advance(deltaMs: number): void;
  /** Set absolute virtual time. */
  set(ms: number): void;
  /** Install into a realm (Date.now / performance.now hooks) when supported. */
  install?(): void | Promise<void>;
  /** Uninstall realm hooks. */
  uninstall?(): void | Promise<void>;
}

export interface ClockOptions {
  /** Starting virtual time. Default 0. */
  startMs?: number;
  /** Freeze Date/performance when install() is called. Default true. */
  freezeWallClock?: boolean;
}
