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
  type WaitOutcome,
} from "./index.js";

const journals: Array<[string, () => Promise<Journal>]> = [
  ["memory journal", async () => createMemoryJournal()],
  [
    "sqlite journal",
    async () =>
      createSqliteJournal({
        databasePath: join(await mkdtemp(join(tmpdir(), "plico-waits-")), "state.sqlite"),
      }),
  ],
];

type Decision = { approved: boolean };

/** One step, one named wait, one more step that records what the wait returned. */
function approvalFlow(log: string[], waitName = "approval:1", timeoutMs?: number) {
  return async (ctx: RunContext) => {
    await ctx.step("before", () => log.push("before"));
    const outcome = await ctx.wait<Decision>(
      waitName,
      timeoutMs === undefined ? undefined : { timeoutMs },
    );
    await ctx.step("after", () => log.push(`after:${JSON.stringify(outcome)}`));
    return outcome;
  };
}

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Condition not reached.");
}

describe.each(journals)("waits on the %s", (_name, makeJournal) => {
  it("stops a run at a wait and runs nothing until a decision arrives", async () => {
    const journal = await makeJournal();
    const engine = createEngine({ journal });
    const log: string[] = [];

    const outcome = await engine.run("run-1", approvalFlow(log), {});

    expect(outcome).toEqual({ state: "waiting" });
    expect(await engine.status("run-1")).toEqual({ state: "waiting" });
    expect(log).toEqual(["before"]);
  });

  it("continues a waiting run in the same process when a decision arrives", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const log: string[] = [];
    await engine.run("run-1", approvalFlow(log), {});

    expect(await engine.signal("run-1", "approval:1", { approved: true })).toBe("accepted");
    await until(async () => (await engine.status("run-1"))?.state === "completed");

    expect(log).toEqual(["before", 'after:{"kind":"signal","value":{"approved":true}}']);
  });

  it("uses a decision that arrived before the wait was reached", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const log: string[] = [];
    const handle = await engine.start(
      "run-1",
      async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return approvalFlow(log)(ctx);
      },
      {},
    );

    expect(await engine.signal("run-1", "approval:1", { approved: true })).toBe("accepted");
    const outcome = await handle.result();

    expect(outcome.state).toBe("completed");
    expect(log[1]).toContain('"approved":true');
  });

  it("continues after a restart: the decision is stored and a new process recovers the run", async () => {
    const journal = await makeJournal();
    const log: string[] = [];
    await createEngine({ journal, workerId: "a" }).run("run-1", approvalFlow(log), {});

    const restarted = createEngine({ journal, workerId: "b" });
    expect(await restarted.recover(() => approvalFlow(log))).toEqual([]);
    await restarted.signal("run-1", "approval:1", { approved: false });
    await until(async () => (await restarted.status("run-1"))?.state === "completed");
    expect(log).toEqual(["before", 'after:{"kind":"signal","value":{"approved":false}}']);
  });

  it("reports a timeout as its own outcome and keeps the deadline across a restart", async () => {
    const journal = await makeJournal();
    let clock = 1_000;
    const log: string[] = [];
    await createEngine({ journal, workerId: "a", now: () => clock }).run(
      "run-1",
      approvalFlow(log, "approval:1", 6_000),
      {},
    );

    const restarted = createEngine({ journal, workerId: "b", now: () => clock });
    clock = 6_999;
    expect(await restarted.recover(() => approvalFlow(log, "approval:1", 6_000))).toEqual([]);
    clock = 7_000;
    const recovered = await restarted.recover(() => approvalFlow(log, "approval:1", 6_000));

    expect(recovered).toEqual([{ runId: "run-1", state: "completed" }]);
    expect(log).toEqual(["before", 'after:{"kind":"timeout"}']);
  });

  it("ends a wait on its own timer in the process that holds the run", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const log: string[] = [];

    await engine.run("run-1", approvalFlow(log, "approval:1", 30), {});
    await until(async () => (await engine.status("run-1"))?.state === "completed");

    expect(log).toEqual(["before", 'after:{"kind":"timeout"}']);
  });

  it("ignores a decision that arrives after the wait timed out", async () => {
    const journal = await makeJournal();
    let clock = 1_000;
    const log: string[] = [];
    const engine = createEngine({ journal, now: () => clock });
    await engine.run("run-1", approvalFlow(log, "approval:1", 1_000), {});
    clock = 2_500;

    expect(await engine.signal("run-1", "approval:1", { approved: true })).toBe("ignored");
    await engine.recover(() => approvalFlow(log, "approval:1", 1_000));
    await until(async () => log.length === 2);

    expect(log[1]).toBe('after:{"kind":"timeout"}');
  });

  it("keeps the first of two conflicting decisions", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const log: string[] = [];
    await engine.run("run-1", approvalFlow(log), {});

    expect(await engine.signal("run-1", "approval:1", { approved: true })).toBe("accepted");
    expect(await engine.signal("run-1", "approval:1", { approved: false })).toBe("ignored");
    await until(async () => log.length === 2);

    expect(log[1]).toContain('"approved":true');
  });

  it("needs a decision for each named wait", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const seen: Array<WaitOutcome<Decision>> = [];
    const workflow = async (ctx: RunContext) => {
      seen.push(await ctx.wait<Decision>("approval:1"));
      seen.push(await ctx.wait<Decision>("approval:2"));
    };
    await engine.run("run-1", workflow, {});

    await engine.signal("run-1", "approval:1", { approved: true });
    await until(
      async () => (await engine.status("run-1"))?.state === "waiting" && seen.length === 1,
    );
    expect((await engine.status("run-1"))?.state).toBe("waiting");

    await engine.signal("run-1", "approval:2", { approved: true });
    await until(async () => (await engine.status("run-1"))?.state === "completed");
  });

  it("does not accept decisions for unknown or finished runs", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    await engine.run("done", async () => "x", {});

    expect(await engine.signal("missing", "approval:1", true)).toBe("unknown");
    expect(await engine.signal("done", "approval:1", true)).toBe("ignored");
  });
});
