import { deflateSync, inflateSync } from "node:zlib";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { RasterFrame } from "@scenelock/core";
import { assertFrameShape, hashPixels } from "./hash.js";

/** On-disk magic for scenelock golden files. */
export const GOLDEN_MAGIC = "SLGN" as const;

/** Current binary format version. */
export const GOLDEN_FORMAT_VERSION = 1 as const;

/** Flag bit: pixel payload is zlib-deflated. */
export const GOLDEN_FLAG_DEFLATE = 0x01 as const;

/** File extension for self-contained golden baselines. */
export const GOLDEN_FILE_EXT = ".golden" as const;

/**
 * Decoded `.golden` file: frame + determinism fingerprint + content hash.
 */
export interface GoldenFile {
  frame: RasterFrame;
  /** Explicit pinned-rasterizer identity stored with the baseline. */
  rasterizerFingerprint: string;
  /** Hex SHA-256 of uncompressed RGBA bytes. */
  contentHash: string;
  /** Whether the on-disk payload was zlib-compressed. */
  compressed: boolean;
  formatVersion: number;
}

export interface SerializeGoldenOptions {
  /** zlib-deflate pixel payload (default true). */
  compress?: boolean;
}

const MAGIC_BYTES = Buffer.from(GOLDEN_MAGIC, "ascii");

/**
 * Serialize a frame + fingerprint into the self-contained `.golden` binary.
 *
 * Layout (little-endian):
 * ```
 * magic[4]="SLGN" | version u8 | flags u8 | width u32 | height u32
 * | fpLen u16 | fingerprint utf8 | contentHash[32] | payloadLen u32 | payload
 * ```
 * `contentHash` is always over uncompressed RGBA. Payload may be raw or deflated.
 */
export function serializeGolden(
  frame: RasterFrame,
  rasterizerFingerprint: string,
  options: SerializeGoldenOptions = {},
): Buffer {
  assertFrameShape(frame);
  if (rasterizerFingerprint.length === 0) {
    throw new Error("rasterizerFingerprint must be a non-empty string");
  }

  const compress = options.compress !== false;
  const raw = Buffer.from(
    frame.pixels.buffer,
    frame.pixels.byteOffset,
    frame.pixels.byteLength,
  );
  const contentHash = Buffer.from(hashPixels(frame.pixels), "hex");
  const fp = Buffer.from(rasterizerFingerprint, "utf8");
  if (fp.length > 0xffff) {
    throw new Error("rasterizerFingerprint exceeds u16 length limit");
  }

  const payload = compress ? deflateSync(raw) : raw;
  const flags = compress ? GOLDEN_FLAG_DEFLATE : 0;

  const header = Buffer.alloc(4 + 1 + 1 + 4 + 4 + 2);
  MAGIC_BYTES.copy(header, 0);
  header.writeUInt8(GOLDEN_FORMAT_VERSION, 4);
  header.writeUInt8(flags, 5);
  header.writeUInt32LE(frame.width, 6);
  header.writeUInt32LE(frame.height, 10);
  header.writeUInt16LE(fp.length, 14);

  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(payload.length, 0);

  return Buffer.concat([header, fp, contentHash, lenBuf, payload]);
}

/**
 * Deserialize a `.golden` buffer. Verifies magic, version, and content hash.
 */
export function deserializeGolden(buf: Buffer): GoldenFile {
  if (buf.length < 4 + 1 + 1 + 4 + 4 + 2 + 32 + 4) {
    throw new Error("golden buffer too short");
  }
  if (buf.subarray(0, 4).toString("ascii") !== GOLDEN_MAGIC) {
    throw new Error(`invalid golden magic (expected ${GOLDEN_MAGIC})`);
  }

  const formatVersion = buf.readUInt8(4);
  if (formatVersion !== GOLDEN_FORMAT_VERSION) {
    throw new Error(`unsupported golden format version ${formatVersion}`);
  }

  const flags = buf.readUInt8(5);
  const compressed = (flags & GOLDEN_FLAG_DEFLATE) !== 0;
  const width = buf.readUInt32LE(6);
  const height = buf.readUInt32LE(10);
  const fpLen = buf.readUInt16LE(14);

  let offset = 16;
  const fpEnd = offset + fpLen;
  if (fpEnd + 32 + 4 > buf.length) {
    throw new Error("golden buffer truncated at fingerprint/hash");
  }
  const rasterizerFingerprint = buf.subarray(offset, fpEnd).toString("utf8");
  offset = fpEnd;

  const storedHash = buf.subarray(offset, offset + 32).toString("hex");
  offset += 32;

  const payloadLen = buf.readUInt32LE(offset);
  offset += 4;
  if (offset + payloadLen > buf.length) {
    throw new Error("golden buffer truncated at payload");
  }
  const payload = buf.subarray(offset, offset + payloadLen);

  const raw = compressed ? inflateSync(payload) : payload;
  const expectedLen = width * height * 4;
  if (raw.length !== expectedLen) {
    throw new Error(
      `golden payload length ${raw.length} !== width*height*4 (${expectedLen})`,
    );
  }

  const pixels = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);
  // Copy so the view owns memory independent of the zlib buffer.
  const owned = new Uint8ClampedArray(pixels);
  const contentHash = hashPixels(owned);
  if (contentHash !== storedHash) {
    throw new Error(
      `golden content hash mismatch (stored=${storedHash}, computed=${contentHash})`,
    );
  }

  return {
    frame: { width, height, pixels: owned },
    rasterizerFingerprint,
    contentHash,
    compressed,
    formatVersion,
  };
}

/** Write a `.golden` file (creates parent directories). */
export async function writeGoldenFile(
  path: string,
  frame: RasterFrame,
  rasterizerFingerprint: string,
  options?: SerializeGoldenOptions,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const buf = serializeGolden(frame, rasterizerFingerprint, options);
  await writeFile(path, buf);
}

/** Read and decode a `.golden` file. */
export async function readGoldenFile(path: string): Promise<GoldenFile> {
  const buf = await readFile(path);
  return deserializeGolden(buf);
}
