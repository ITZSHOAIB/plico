import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
        databasePath: join(await mkdtemp(join(tmpdir(), "plico-cancel-")), "state.sqlite"),
      }),
  ],
];

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Condition not reached.");
}

describe.each(journals)("cancel on the %s", (_name, makeJournal) => {
  it("ends a waiting run and runs nothing after the wait", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const log: string[] = [];
    const workflow = async (ctx: RunContext) => {
      await ctx.wait("approval:1");
      await ctx.step("after", () => log.push("after"));
    };
    await engine.run("run-1", workflow, {});

    expect(await engine.cancel("run-1")).toBe("accepted");
    await until(async () => (await engine.status("run-1"))?.state === "cancelled");

    expect(log).toEqual([]);
    expect(await engine.signal("run-1", "approval:1", { approved: true })).toBe("ignored");
  });

  it("aborts the step that is running", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    let aborted = false;
    const handle = await engine.start(
      "run-1",
      async (ctx) => {
        await ctx.step("slow", ({ signal }) => {
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("stopped"));
            });
          });
        });
        await ctx.step("never", () => 1);
      },
      {},
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await engine.cancel("run-1")).toBe("accepted");
    const outcome = await handle.result();

    expect(aborted).toBe(true);
    expect(outcome).toEqual({ state: "cancelled" });
    expect(await engine.status("run-1")).toEqual({ state: "cancelled" });
  });

  it("aborts a running step when another engine requests cancellation", async () => {
    const journal = await makeJournal();
    const first = createEngine({ journal, workerId: "a", leaseMs: 30 });
    const second = createEngine({ journal, workerId: "b", leaseMs: 30 });
    let aborted = false;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const handle = await first.start(
      "cross",
      async (ctx) => {
        await ctx.step(
          "slow",
          ({ signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("stopped"));
              });
              started();
            }),
        );
      },
      {},
    );
    await ready;
    expect(await second.cancel("cross")).toBe("accepted");
    expect((await handle.result()).state).toBe("cancelled");
    expect(aborted).toBe(true);
  });

  it("stops before the next step when a step ignores the abort signal", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    const log: string[] = [];
    const handle = await engine.start(
      "run-1",
      async (ctx) => {
        await ctx.step("slow", () => new Promise((resolve) => setTimeout(resolve, 30)));
        await ctx.step("next", () => log.push("next"));
      },
      {},
    );
    await engine.cancel("run-1");

    expect((await handle.result()).state).toBe("cancelled");
    expect(log).toEqual([]);
  });

  it("cancels a waiting run from another process through recover", async () => {
    const journal = await makeJournal();
    const workflow = async (ctx: RunContext) => {
      await ctx.wait("approval:1");
    };
    await createEngine({ journal, workerId: "a" }).run("run-1", workflow, {});

    const other = createEngine({ journal, workerId: "b" });
    expect(await other.cancel("run-1")).toBe("accepted");
    const recovered = await other.recover(() => workflow);

    expect(recovered).toEqual([{ runId: "run-1", state: "cancelled" }]);
  });

  it("ignores cancel for finished, cancelled and unknown runs", async () => {
    const engine = createEngine({ journal: await makeJournal() });
    await engine.run("done", async () => "x", {});

    expect(await engine.cancel("done")).toBe("ignored");
    expect(await engine.cancel("missing")).toBe("unknown");
  });
});

it("does not crash when cancellation cannot claim a waiting run", () => {
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/engine/index.ts")).href;
  const program = `
    import { createEngine, createMemoryJournal } from ${JSON.stringify(moduleUrl)};
    const journal = createMemoryJournal();
    journal.claim = async () => { throw new Error("claim failed"); };
    const engine = createEngine({ journal });
    await engine.run("run", async (ctx) => ctx.wait("approval"), {});
    await engine.cancel("run");
    await new Promise(resolve => setTimeout(resolve, 30));
  `;
  expect(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program]),
  ).not.toThrow();
});

it("aborts a step when cancellation comes from another process", async () => {
  const databasePath = join(await mkdtemp(join(tmpdir(), "plico-cancel-process-")), "state.sqlite");
  const journal = createSqliteJournal({ databasePath });
  const engine = createEngine({ journal, workerId: "a", leaseMs: 60 });
  let aborted = false;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const handle = await engine.start(
    "cross-process",
    async (ctx) => {
      await ctx.step(
        "slow",
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("stopped"));
            });
            started();
          }),
      );
    },
    {},
  );
  await ready;
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/engine/index.ts")).href;
  const program = `
    import { createEngine, createSqliteJournal } from ${JSON.stringify(moduleUrl)};
    const engine = createEngine({ journal: createSqliteJournal({ databasePath: process.argv[1] }), workerId: "b" });
    if (await engine.cancel("cross-process") !== "accepted") process.exit(1);
  `;
  execFileSync(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    program,
    databasePath,
  ]);
  expect((await handle.result()).state).toBe("cancelled");
  expect(aborted).toBe(true);
}, 15000);
