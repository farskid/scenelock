/**
 * FNV-1a 32-bit — stable, dependency-free seed materialization.
 * Same input string always yields the same unsigned 32-bit value across processes.
 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
