import { describe, expect, it } from "vitest";
import {
  createExecutor,
  createSeed,
  createStepLoopDriver,
  createVirtualClock,
  ExecutorFailure,
  executorFactory,
  hashSeed,
  runWithSeed,
} from "../index.js";

describe("@scenelock/executor", () => {
  it("creates stable seeds and a virtual clock", async () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    const seed = createSeed("replay-1");
    expect(seed.value).toBe("replay-1");
    const clock = createVirtualClock({ startMs: 1000 });
    clock.advance(16);
    expect(clock.now()).toBe(1016);

    const ex = createExecutor({ seed: "replay-1" });
    expect(ex.seed.value).toBe("replay-1");
    const result = await ex.run(async (ctx) => {
      ctx.clock.advance(1);
      return ctx.clock.now();
    });
    expect(result).toBe(1);
  });

  it("same seed → identical random sequences across runWithSeed", async () => {
    const collect = async (seed: string) =>
      runWithSeed(seed, async (ctx) =>
        Array.from({ length: 12 }, () => ctx.random.next()),
      );

    expect(await collect("s-1")).toEqual(await collect("s-1"));
    expect(await collect("s-1")).not.toEqual(await collect("s-2"));
  });

  it("run() resets clock/random so successive runs replay from the seed", async () => {
    const ex = createExecutor({ seed: "reset-me" });
    const first = await ex.run(async (ctx) => {
      ctx.clock.advance(100);
      return {
        t: ctx.clock.now(),
        r: Array.from({ length: 5 }, () => ctx.random.next()),
      };
    });
    const second = await ex.run(async (ctx) => {
      return {
        t: ctx.clock.now(),
        r: Array.from({ length: 5 }, () => ctx.random.next()),
      };
    });
    expect(first.t).toBe(100);
    expect(second.t).toBe(0);
    expect(second.r).toEqual(first.r);
  });

  it("rejects concurrent overlapping run()", async () => {
    const ex = createExecutor({ seed: "concurrent" });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = ex.run(async () => {
      await gate;
      return 1;
    });

    await expect(ex.run(async () => 2)).rejects.toThrow(/concurrent run/);
    release();
    await expect(first).resolves.toBe(1);
  });

  it("failure envelope carries seed + tier", async () => {
    const ex = createExecutor({ seed: "boom-seed", tier: "engine" });
    try {
      await ex.run(async () => {
        throw new Error("invariant broken");
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutorFailure);
      const fail = e as ExecutorFailure;
      expect(fail.envelope.seed).toBe("boom-seed");
      expect(fail.envelope.tier).toBe("engine");
      expect(fail.envelope.status).toBe("failed");
      expect(fail.envelope.error.message).toBe("invariant broken");
      expect(fail.envelope.artifacts).toEqual({});
    }
  });

  it("runWithSeed reproduces a prior failing seed's random stream", async () => {
    let capturedSeed = "";
    let capturedSeq: number[] = [];
    try {
      await runWithSeed("replay-token", async (ctx) => {
        capturedSeed = ctx.seed.value;
        capturedSeq = Array.from({ length: 6 }, () => ctx.random.next());
        throw new Error("fail");
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutorFailure);
      expect((e as ExecutorFailure).envelope.seed).toBe("replay-token");
    }

    const replayed = await runWithSeed(capturedSeed, async (ctx) =>
      Array.from({ length: 6 }, () => ctx.random.next()),
    );
    expect(replayed).toEqual(capturedSeq);
  });

  it("tick drives stepLoop then settled", async () => {
    const order: string[] = [];
    const driver = createStepLoopDriver(
      {
        step() {
          order.push("step");
        },
        async settled() {
          order.push("settled");
        },
      },
      { fixedDtMs: 16 },
    );
    const ex = createExecutor({ seed: "tick", stepLoop: driver });
    await ex.run(async (ctx) => {
      await ctx.tick(16);
    });
    expect(order).toEqual(["step", "settled"]);
  });

  it("withStepLoop attaches a driver", async () => {
    let stepped = 0;
    const ex = createExecutor({ seed: "attach" }).withStepLoop({
      step() {
        stepped++;
      },
      async settled() {},
    });
    await ex.run(async (ctx) => {
      await ctx.tick(1);
    });
    expect(stepped).toBe(1);
  });

  it("executorFactory.create matches createExecutor", async () => {
    const ex = executorFactory.create({ seed: "factory" });
    expect(ex.seed.value).toBe("factory");
    expect(ex.tier).toBe("engine");
  });
});
