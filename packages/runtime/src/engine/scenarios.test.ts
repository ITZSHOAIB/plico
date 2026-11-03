import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEngine,
  createMemoryJournal,
  createSqliteJournal,
  type Journal,
  type RunContext,
} from "./index.js";

const journals: Array<[string, () => Promise<Journal>]> = [
  ["memory journal", async () => createMemoryJournal()],
  [
    "sqlite journal",
    async () =>
      createSqliteJournal({
        databasePath: join(await mkdtemp(join(tmpdir(), "plico-engine-")), "state.sqlite"),
      }),
  ],
];

describe.each(journals)("engine scenarios on the %s", (_name, makeJournal) => {
  const never = new Promise<never>(() => undefined);

  it("a worker that lost its lease is recovered from its recorded steps", async () => {
    const journal = await makeJournal();
    let clock = 1_000;
    const calls: string[] = [];
    const workflow = (stall: boolean) => async (ctx: RunContext) => {
      await ctx.step("first", () => calls.push("first"));
      await ctx.step("second", () => {
        calls.push("second");
        return stall ? never : "two";
      });
      return "done";
    };
    const dead = createEngine({ journal, workerId: "a", leaseMs: 100, now: () => clock });
    void dead.start("run-1", workflow(true), {});
    await new Promise((resolve) => setTimeout(resolve, 20));

    const live = createEngine({ journal, workerId: "b", leaseMs: 100, now: () => clock });
    expect(await live.recover(() => workflow(false))).toEqual([]);

    clock += 101;
    const recovered = await live.recover(() => workflow(false));

    expect(recovered).toEqual([{ runId: "run-1", state: "completed", output: "done" }]);
    expect(calls).toEqual(["first", "second", "second"]);
    expect(await live.status("run-1")).toEqual({ state: "completed" });
  });

  it("only one of two recoverers takes a stale run", async () => {
    const journal = await makeJournal();
    let clock = 1_000;
    const dead = createEngine({ journal, workerId: "a", leaseMs: 100, now: () => clock });
    void dead.start("run-1", (ctx) => ctx.step("s", () => never), {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    clock += 101;
    let ran = 0;
    const workflow = (ctx: RunContext) => ctx.step("s", () => ++ran);

    const [x, y] = await Promise.all([
      createEngine({ journal, workerId: "b", leaseMs: 100, now: () => clock }).recover(
        () => workflow,
      ),
      createEngine({ journal, workerId: "c", leaseMs: 100, now: () => clock }).recover(
        () => workflow,
      ),
    ]);

    expect(x.length + y.length).toBe(1);
    expect(ran).toBe(1);
  });

  it("refuses to resume a run held by a live worker", async () => {
    const journal = await makeJournal();
    const first = createEngine({ journal, workerId: "a", leaseMs: 10_000 });
    await first.start("run-live", () => never, {});
    const second = createEngine({ journal, workerId: "b" });
    await expect(second.resume("run-live", async () => "wrong")).rejects.toThrow(/lease|held/i);
  });

  it("leaves finished runs alone", async () => {
    const journal = await makeJournal();
    let clock = 1_000;
    await createEngine({ journal, workerId: "a", leaseMs: 100, now: () => clock }).run(
      "run-1",
      async () => "x",
      {},
    );
    clock += 1_000;

    expect(
      await createEngine({ journal, workerId: "b", now: () => clock }).recover(
        () => async () => "y",
      ),
    ).toEqual([]);
  });
});
