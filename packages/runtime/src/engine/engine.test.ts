import { describe, expect, it } from "vitest";
import {
  createEngine,
  createMemoryJournal,
  type Engine,
  type RunContext,
  type RunOutcome,
} from "./index.js";

function newEngine(): Engine {
  return createEngine({ journal: createMemoryJournal() });
}

async function completed<O>(outcome: Promise<RunOutcome<O>>): Promise<O> {
  const result = await outcome;
  if (result.state !== "completed") throw new Error("Run did not complete.");
  return result.output;
}

describe("engine steps", () => {
  it("runs a workflow and returns its output", async () => {
    const engine = newEngine();

    const output = await completed(
      engine.run(
        "run-1",
        async (ctx, input: { n: number }) => {
          const doubled = await ctx.step("double", () => input.n * 2);
          return doubled + 1;
        },
        { n: 20 },
      ),
    );

    expect(output).toBe(41);
    expect(await engine.status("run-1")).toEqual({ state: "completed" });
  });

  it("runs a step with retries: 0 once and surfaces its failure", async () => {
    const engine = newEngine();
    let attempts = 0;

    const run = engine.run(
      "run-1",
      async (ctx) => {
        await ctx.step("flaky", () => {
          attempts += 1;
          throw new Error("boom");
        });
      },
      {},
    );

    await expect(run).rejects.toThrow("boom");
    expect(attempts).toBe(1);
    expect(await engine.status("run-1")).toEqual({ state: "failed" });
  });

  it("retries a step inside one step", async () => {
    const engine = newEngine();
    let attempts = 0;

    const output = await completed(
      engine.run(
        "run-1",
        async (ctx) =>
          ctx.step(
            "flaky",
            ({ attempt }) => {
              attempts += 1;
              if (attempt < 2) throw new Error("again");
              return "ok";
            },
            { retries: 2 },
          ),
        {},
      ),
    );

    expect(output).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("replays recorded steps when a run starts again with the same id", async () => {
    const journal = createMemoryJournal();
    let calls = 0;
    const workflow = async (ctx: RunContext) => {
      const first = await ctx.step("first", () => {
        calls += 1;
        return { value: "one" };
      });
      await ctx.step("second", () => {
        calls += 1;
        if (calls === 2) throw new Error("crash");
        return "two";
      });
      return first.value;
    };

    await expect(createEngine({ journal }).run("run-1", workflow, {})).rejects.toThrow("crash");
    const output = await completed(createEngine({ journal }).resume("run-1", workflow));

    expect(output).toBe("one");
    expect(calls).toBe(3);
  });

  it("fails loudly when replayed step names no longer match", async () => {
    const journal = createMemoryJournal();
    await expect(
      createEngine({ journal }).run(
        "run-1",
        async (ctx) => {
          await ctx.step("a", () => 1);
          throw new Error("stop");
        },
        {},
      ),
    ).rejects.toThrow("stop");

    const resumed = createEngine({ journal }).resume("run-1", async (ctx) => {
      await ctx.step("renamed", () => 1);
    });

    await expect(resumed).rejects.toThrow(/project changed during run/i);
  });

  it("returns step results as they survive JSON", async () => {
    const engine = newEngine();

    const output = await completed(
      engine.run("run-1", (ctx) => ctx.step("value", () => ({ a: undefined, b: 1 })), {}),
    );

    expect(output).toEqual({ b: 1 });
  });

  it("start returns once the run is registered and exposes the result", async () => {
    const engine = newEngine();
    const handle = await engine.start("run-1", async (ctx) => ctx.step("s", () => "done"), {});

    expect(handle.runId).toBe("run-1");
    expect(await handle.result()).toEqual({ state: "completed", output: "done" });
  });

  it("refuses to start a run id that already finished", async () => {
    const engine = newEngine();
    await engine.run("run-1", async () => "x", {});

    await expect(engine.run("run-1", async () => "y", {})).rejects.toThrow(/already/i);
  });
});
