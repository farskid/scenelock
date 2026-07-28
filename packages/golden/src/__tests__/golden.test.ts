import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RASTERIZER_ASSUMPTIONS,
  FINGERPRINT_DRIFT_CODE,
  GOLDEN_MAGIC,
  assertFrameShape,
  compareFrames,
  createGoldenCompare,
  createMemoryGoldenStore,
  deserializeGolden,
  DirectoryGoldenStore,
  framesEqual,
  hashFrame,
  isFingerprintDrift,
  readGoldenFile,
  serializeGolden,
  toFailureEnvelope,
  writeGoldenFile,
  type RasterFrame,
} from "../index.js";

const FP = "thorvg-sw@test-1";

function solid(width: number, height: number, rgba: [number, number, number, number]): RasterFrame {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = rgba[0];
    pixels[i + 1] = rgba[1];
    pixels[i + 2] = rgba[2];
    pixels[i + 3] = rgba[3];
  }
  return { width, height, pixels };
}

function setPixel(frame: RasterFrame, x: number, y: number, rgba: [number, number, number, number]): void {
  const i = (y * frame.width + x) * 4;
  frame.pixels[i] = rgba[0];
  frame.pixels[i + 1] = rgba[1];
  frame.pixels[i + 2] = rgba[2];
  frame.pixels[i + 3] = rgba[3];
}

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scenelock-golden-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("RASTERIZER_ASSUMPTIONS", () => {
  it("documents no-tolerance software-only pin", () => {
    expect(RASTERIZER_ASSUMPTIONS.tolerance).toBe("none");
    expect(RASTERIZER_ASSUMPTIONS.softwareOnly).toBe(true);
    expect(RASTERIZER_ASSUMPTIONS.fingerprintRequired).toBe(true);
  });
});

describe("serialization roundtrip", () => {
  it("roundtrips frame + fingerprint with deflate", () => {
    const frame = solid(3, 2, [10, 20, 30, 255]);
    setPixel(frame, 1, 1, [1, 2, 3, 4]);
    const buf = serializeGolden(frame, FP, { compress: true });
    expect(buf.subarray(0, 4).toString("ascii")).toBe(GOLDEN_MAGIC);

    const decoded = deserializeGolden(buf);
    expect(decoded.rasterizerFingerprint).toBe(FP);
    expect(decoded.compressed).toBe(true);
    expect(decoded.frame.width).toBe(3);
    expect(decoded.frame.height).toBe(2);
    expect(decoded.contentHash).toBe(hashFrame(frame));
    expect([...decoded.frame.pixels]).toEqual([...frame.pixels]);
  });

  it("roundtrips uncompressed payload", () => {
    const frame = solid(2, 2, [9, 8, 7, 6]);
    const buf = serializeGolden(frame, "cairo@1", { compress: false });
    const decoded = deserializeGolden(buf);
    expect(decoded.compressed).toBe(false);
    expect(decoded.rasterizerFingerprint).toBe("cairo@1");
    expect([...decoded.frame.pixels]).toEqual([...frame.pixels]);
  });

  it("writeGoldenFile / readGoldenFile roundtrip on disk", async () => {
    const dir = await tempDir();
    const path = join(dir, "sample.golden");
    const frame = solid(4, 1, [255, 0, 0, 255]);
    await writeGoldenFile(path, frame, FP);
    const loaded = await readGoldenFile(path);
    expect(loaded.contentHash).toBe(hashFrame(frame));
    expect([...loaded.frame.pixels]).toEqual([...frame.pixels]);
  });

  it("rejects corrupt content hash", () => {
    const frame = solid(1, 1, [1, 2, 3, 255]);
    const buf = Buffer.from(serializeGolden(frame, FP));
    // Flip a byte inside the stored hash region (after header+fp).
    const fpLen = Buffer.byteLength(FP, "utf8");
    const hashOffset = 16 + fpLen;
    buf.writeUInt8(buf.readUInt8(hashOffset) ^ 0xff, hashOffset);
    expect(() => deserializeGolden(buf)).toThrow(/content hash mismatch/);
  });

  it("assertFrameShape rejects bad length", () => {
    expect(() =>
      assertFrameShape({ width: 2, height: 2, pixels: new Uint8ClampedArray(4) }),
    ).toThrow(/pixel length/);
  });
});

describe("compareFrames", () => {
  it("uses hash fast path on identical frames", () => {
    const a = solid(8, 8, [0, 0, 0, 255]);
    const b = solid(8, 8, [0, 0, 0, 255]);
    const result = compareFrames(a, b);
    expect(result.verdict).toBe("match");
    expect(result.usedHashFastPath).toBe(true);
    expect(result.actualHash).toBe(result.expectedHash);
  });

  it("reports pixel count, bbox, and samples on mismatch", () => {
    const expected = solid(4, 4, [0, 0, 0, 255]);
    const actual = solid(4, 4, [0, 0, 0, 255]);
    setPixel(actual, 1, 2, [10, 20, 30, 255]);
    setPixel(actual, 3, 3, [40, 50, 60, 70]);

    const result = compareFrames(actual, expected, { maxSamples: 8 });
    expect(result.verdict).toBe("mismatch");
    expect(result.usedHashFastPath).toBe(false);
    expect(result.report?.differingPixelCount).toBe(2);
    expect(result.report?.boundingBox).toEqual({ x: 1, y: 2, width: 3, height: 2 });
    expect(result.report?.samples).toHaveLength(2);
    expect(result.report?.samples[0]).toMatchObject({
      x: 1,
      y: 2,
      actual: [10, 20, 30, 255],
      expected: [0, 0, 0, 255],
    });
    expect(result.report?.firstDiffByte).toBe((2 * 4 + 1) * 4);
    expect(result.report?.diffByteCount).toBeGreaterThan(0);
  });

  it("detects dimension mismatch", () => {
    const result = compareFrames(solid(2, 2, [0, 0, 0, 0]), solid(3, 2, [0, 0, 0, 0]));
    expect(result.verdict).toBe("dimension-mismatch");
    expect(result.actual).toEqual({ width: 2, height: 2 });
    expect(result.expected).toEqual({ width: 3, height: 2 });
  });

  it("framesEqual maps to GoldenDiff", () => {
    const a = solid(1, 1, [1, 2, 3, 4]);
    expect(framesEqual(a, a).verdict).toBe("match");
    const b = solid(1, 1, [9, 2, 3, 4]);
    const diff = framesEqual(a, b);
    expect(diff.verdict).toBe("mismatch");
    expect(diff.firstDiffByte).toBe(0);
  });
});

describe("DirectoryGoldenStore", () => {
  it("missing baseline never auto-passes", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    const frame = solid(2, 2, [1, 1, 1, 255]);
    const result = await store.compare("suite::new", frame);
    expect(result.verdict).toBe("missing-baseline");
    expect(result.wroteBaseline).toBe(false);
    expect(result.diff.verdict).toBe("missing-baseline");
  });

  it("updateGoldens writes new baseline but still reports missing-baseline", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    const frame = solid(2, 2, [5, 5, 5, 255]);
    const written = await store.compare("paint/fill", frame, { updateGoldens: true });
    expect(written.verdict).toBe("missing-baseline");
    expect(written.wroteBaseline).toBe(true);

    const again = await store.compare("paint/fill", frame);
    expect(again.verdict).toBe("match");
  });

  it("match and mismatch with artifact paths", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({
      directory: dir,
      rasterizerFingerprint: FP,
      maxDiffSamples: 4,
    });
    const baseline = solid(3, 3, [0, 0, 0, 255]);
    await store.write("pixel-test", baseline);

    const ok = await store.compare("pixel-test", solid(3, 3, [0, 0, 0, 255]));
    expect(ok.verdict).toBe("match");

    const badFrame = solid(3, 3, [0, 0, 0, 255]);
    setPixel(badFrame, 0, 0, [255, 0, 0, 255]);
    const bad = await store.compare("pixel-test", badFrame);
    expect(bad.verdict).toBe("mismatch");
    expect(bad.artifacts?.actual).toMatch(/\.actual\.golden$/);
    expect(bad.artifacts?.expected).toMatch(/\.expected\.golden$/);
    expect(bad.artifacts?.diffReport).toMatch(/\.diff\.json$/);
    expect(bad.diff.diffPath).toBe(bad.artifacts?.diffReport);
    expect(bad.report?.differingPixelCount).toBe(1);
  });

  it("update overwrites on mismatch as updated", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    await store.write("u", solid(1, 1, [0, 0, 0, 255]));
    const next = solid(1, 1, [1, 1, 1, 255]);
    const result = await store.compare("u", next, { update: true });
    expect(result.verdict).toBe("updated");
    expect(result.wroteBaseline).toBe(true);
    const re = await store.compare("u", next);
    expect(re.verdict).toBe("match");
  });

  it("fingerprint drift is distinct from regression", async () => {
    const dir = await tempDir();
    const writer = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    const frame = solid(2, 1, [7, 7, 7, 255]);
    await writer.write("drift", frame);

    const drifted = new DirectoryGoldenStore({
      directory: dir,
      rasterizerFingerprint: "thorvg-sw@other",
    });
    const result = await drifted.compare("drift", frame);
    expect(result.verdict).toBe("fingerprint-drift");
    expect(isFingerprintDrift(result)).toBe(true);
    expect(result.storedFingerprint).toBe(FP);
    expect(result.runFingerprint).toBe("thorvg-sw@other");
  });

  it("reportStale lists unowned goldens (report only)", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    await store.write("owned", solid(1, 1, [0, 0, 0, 255]));
    await store.write("orphan", solid(1, 1, [1, 1, 1, 255]));

    store.beginRun();
    await store.compare("owned", solid(1, 1, [0, 0, 0, 255]));
    const stale = await store.reportStale();
    expect(stale).toEqual(["orphan"]);
  });

  it("suite prefix keys nested logical names", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    const frame = solid(1, 1, [2, 2, 2, 255]);
    await store.compare("a", frame, { suite: "engine", updateGoldens: true });
    const hit = await store.compare("a", frame, { suite: "engine" });
    expect(hit.verdict).toBe("match");
  });
});

describe("createGoldenCompare / memory store", () => {
  it("implements core GoldenCompare", async () => {
    const frame = solid(1, 1, [1, 2, 3, 255]);
    const store = createMemoryGoldenStore({ a: frame });
    const cmp = createGoldenCompare(store);
    expect((await cmp.compare("a", frame)).verdict).toBe("match");
    expect(
      (
        await cmp.compare("a", {
          width: 1,
          height: 1,
          pixels: new Uint8ClampedArray([9, 2, 3, 255]),
        })
      ).verdict,
    ).toBe("mismatch");
    expect((await cmp.compare("missing", frame)).verdict).toBe("missing-baseline");
    expect((await cmp.compare("missing", frame, { update: true })).verdict).toBe(
      "missing-baseline",
    );
    expect((await cmp.compare("missing", frame)).verdict).toBe("match");
  });
});

describe("toFailureEnvelope", () => {
  it("maps mismatch to golden-tier envelope with matcher + artifact paths", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    const baseline = solid(2, 2, [0, 0, 0, 255]);
    await store.write("fail-me", baseline);
    const actual = solid(2, 2, [0, 0, 0, 255]);
    setPixel(actual, 1, 1, [255, 255, 255, 255]);
    const result = await store.compare("fail-me", actual);

    const envelope = toFailureEnvelope(result, {
      testId: "file::fail-me",
      file: "golden.test.ts",
      title: "fail-me",
      seed: "seed-1",
    });

    expect(envelope.tier).toBe("golden");
    expect(envelope.status).toBe("failed");
    expect(envelope.error.matcher).toBe("golden");
    expect(envelope.artifacts.goldenDiff).toBe(result.artifacts?.diffReport);
    expect(envelope.artifacts.actualGolden).toBe(result.artifacts?.actual);
    expect(envelope.artifacts.expectedGolden).toBe(result.artifacts?.expected);
    expect(envelope.seed).toBe("seed-1");
  });

  it("maps fingerprint drift with environment-drift matcher", async () => {
    const dir = await tempDir();
    const writer = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    await writer.write("x", solid(1, 1, [0, 0, 0, 255]));

    const store = new DirectoryGoldenStore({
      directory: dir,
      rasterizerFingerprint: "other",
    });
    const result = await store.compare("x", solid(1, 1, [0, 0, 0, 255]));
    const envelope = toFailureEnvelope(result, {
      testId: "x",
      file: "t.ts",
      title: "x",
    });
    expect(envelope.error.matcher).toBe(FINGERPRINT_DRIFT_CODE);
    expect(envelope.error.message).toMatch(/environment drift/i);
  });

  it("maps missing baseline without treating as pass", async () => {
    const dir = await tempDir();
    const store = new DirectoryGoldenStore({ directory: dir, rasterizerFingerprint: FP });
    const result = await store.compare("nope", solid(1, 1, [0, 0, 0, 255]));
    const envelope = toFailureEnvelope(result, {
      testId: "nope",
      file: "t.ts",
      title: "nope",
    });
    expect(envelope.error.message).toMatch(/Missing golden/);
    expect(envelope.error.matcher).toBe("golden");
  });
});
