import { describe, expect, it } from "vitest";
import type { Engine } from "../engine/index.js";

/** Adapter authors can register these engine-only scenarios with their own factory. */
export function engineConformance(name: string, makeEngine: () => Promise<Engine>): void {
  describe(`engine conformance: ${name}`, () => {
    it("runs a zero-retry step once and retries twice within a step", async () => {
      const engine = await makeEngine();
      let failed = 0;
      await expect(
        engine.run(
          "fail",
          async (ctx) =>
            ctx.step("fail", () => {
              failed++;
              throw new Error("stop");
            }),
          {},
        ),
      ).rejects.toThrow("stop");
      expect(failed).toBe(1);
      let tries = 0;
      const result = await engine.run(
        "retry",
        async (ctx) =>
          ctx.step(
            "retry",
            () => {
              if (++tries < 3) throw new Error("retry");
              return "ok";
            },
            { retries: 2 },
          ),
        {},
      );
      expect(result).toEqual({ state: "completed", output: "ok" });
      expect(tries).toBe(3);
    });

    it("holds early decisions and keeps the first conflicting decision", async () => {
      const engine = await makeEngine();
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const handle = await engine.start(
        "early",
        async (ctx) => {
          await barrier;
          return ctx.wait("decision");
        },
        {},
      );
      expect(await engine.signal("early", "decision", true)).toBe("accepted");
      expect(await engine.signal("early", "decision", false)).toBe("ignored");
      release();
      expect(await handle.result()).toEqual({
        state: "completed",
        output: { kind: "signal", value: true },
      });
    });

    it("distinguishes a timeout from a decision", async () => {
      const engine = await makeEngine();
      let outcome: unknown;
      const handle = await engine.start(
        "timeout",
        async (ctx) => {
          outcome = await ctx.wait("decision", { timeoutMs: 20 });
          return outcome;
        },
        {},
      );
      expect((await handle.result()).state).toBe("waiting");
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(await engine.signal("timeout", "decision", true)).toBe("ignored");
      for (let n = 0; n < 100 && (await engine.status("timeout"))?.state !== "completed"; n++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await engine.status("timeout")).toEqual({ state: "completed" });
      expect(outcome).toEqual({ kind: "timeout" });
    });

    it("requires a separate decision for each named approval", async () => {
      const engine = await makeEngine();
      const seen: unknown[] = [];
      await engine.run(
        "two",
        async (ctx) => {
          seen.push(await ctx.wait("first"));
          seen.push(await ctx.wait("second"));
        },
        {},
      );
      expect(await engine.signal("two", "first", true)).toBe("accepted");
      for (let n = 0; n < 100 && seen.length < 1; n++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect(seen).toEqual([{ kind: "signal", value: true }]);
      expect((await engine.status("two"))?.state).toBe("waiting");
      expect(await engine.signal("two", "second", false)).toBe("accepted");
      for (let n = 0; n < 100 && (await engine.status("two"))?.state !== "completed"; n++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect(seen.at(-1)).toEqual({ kind: "signal", value: false });
    });

    it("cancels a waiting run and aborts a running step", async () => {
      const engine = await makeEngine();
      await engine.run("waiting", async (ctx) => ctx.wait("decision"), {});
      expect(await engine.cancel("waiting")).toBe("accepted");
      for (let n = 0; n < 100 && (await engine.status("waiting"))?.state !== "cancelled"; n++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await engine.status("waiting")).toEqual({ state: "cancelled" });
      let ready!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const handle = await engine.start(
        "busy",
        async (ctx) =>
          ctx.step(
            "slow",
            ({ signal }) =>
              new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new Error("aborted")));
                ready();
              }),
          ),
        {},
      );
      await started;
      expect(await engine.cancel("busy")).toBe("accepted");
      expect((await handle.result()).state).toBe("cancelled");
    });
  });
}
