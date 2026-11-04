import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createSqliteEventStore } from "../index.js";

const execFileAsync = promisify(execFile);

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-recovery-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  return root;
}

describe("run recovery", () => {
  it("requires run.failed immediately after a run.error", async () => {
    const root = await scaffold();
    const store = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    const base = {
      schemaVersion: 1 as const,
      streamType: "run" as const,
      streamId: "error-order",
      runId: "error-order",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    await store.appendEvent({
      ...base,
      id: "evt-0001",
      sequence: 1,
      type: "run.started",
      payload: { projectRoot: root, projectName: "Demo" },
    });
    await store.appendEvent({
      ...base,
      id: "evt-0002",
      sequence: 2,
      type: "run.error",
      payload: { phase: "runtime", message: "failure" },
    });
    await expect(
      store.appendEvent({
        ...base,
        id: "evt-0003",
        sequence: 3,
        type: "assistant.output",
        payload: { content: "unexpected" },
      }),
    ).rejects.toThrow("run.failed");
    await store.appendEvent({
      ...base,
      id: "evt-0003",
      sequence: 3,
      type: "run.failed",
      payload: { phase: "runtime" },
    });
    expect((await store.getRun("error-order"))?.status).toBe("failed");
  });

  it("waits for another process to release the journal lock on first open", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE lock_fixture (value TEXT)");
    database.close();
    const program = `import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.argv[1]); db.exec("BEGIN IMMEDIATE");
      process.stdout.write("locked\\n"); setTimeout(() => { db.exec("COMMIT"); db.close(); }, 750);`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", program, databasePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.once("data", () => resolve());
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`Child exited before locking: ${code}`)));
      });
      const store = createSqliteEventStore({ databasePath });
      expect(await store.listRuns()).toEqual([]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 15000);

  it("fails an interrupted run on reopening without failing a live process's run", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const childTemp = join(root, "child-temp");
    await mkdir(childTemp);
    const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
    const program = `import { createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
      const store = createSqliteEventStore({ databasePath: process.argv[1] });
      setInterval(() => {}, 1000);
      void runProject(process.argv[2], { runId: "crashed", eventStore: store, onStarted: () => process.stdout.write("ready\\n"), provider: { async *stream() { await new Promise(() => {}); } }, message: "hello" });`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", program, databasePath, root],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, TMP: childTemp, TEMP: childTemp, TMPDIR: childTemp },
      },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.once("data", () => resolve());
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`Child exited before starting: ${code}`)));
      });
      expect(await createSqliteEventStore({ databasePath }).getRun("crashed")).toMatchObject({
        status: "running",
        endedAt: null,
      });
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      // Simulate the operating system reusing the dead owner's PID for a live process.
      const probe = new DatabaseSync(databasePath);
      probe
        .prepare("UPDATE run_owners SET process_id = ? WHERE run_id = ?")
        .run(process.pid, "crashed");
      probe.close();
      const recoveryProgram = `import { createSqliteEventStore } from ${JSON.stringify(moduleUrl)}; const store = createSqliteEventStore({ databasePath: process.argv[1] }); console.log((await store.getRun("crashed"))?.status);`;
      const recoveries = await Promise.all(
        Array.from({ length: 2 }, () =>
          execFileAsync(process.execPath, [
            "--import",
            "tsx",
            "--input-type=module",
            "-e",
            recoveryProgram,
            databasePath,
          ]),
        ),
      );
      expect(recoveries.map((result) => result.stdout.trim())).toEqual(["failed", "failed"]);
      const store = createSqliteEventStore({ databasePath });
      expect(await store.getRun("crashed")).toMatchObject({
        status: "failed",
        endedAt: expect.any(String),
      });
      const events = await store.getEvents("crashed");
      expect(events.slice(-2).map((event) => event.type)).toEqual(["run.error", "run.failed"]);
      expect(events.at(-2)?.payload).toMatchObject({
        message: expect.stringMatching(/interrupt/i),
      });
      expect(await createSqliteEventStore({ databasePath }).getEvents("crashed")).toEqual(events);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 15000);

  it("finishes an interrupted failure without duplicating the error event", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
    const program = `import { createSqliteEventStore } from ${JSON.stringify(moduleUrl)};
      const store = createSqliteEventStore({ databasePath: process.argv[1] });
      const base = { schemaVersion: 1, streamType: "run", streamId: "half-failed", runId: "half-failed", timestamp: "2026-01-01T00:00:00.000Z" };
      await store.appendEvent({ ...base, id: "evt-0001", sequence: 1, type: "run.started", payload: { projectRoot: process.argv[2], projectName: "Demo" } });
      await store.appendEvent({ ...base, id: "evt-0002", sequence: 2, type: "run.error", payload: { phase: "runtime", message: "Original failure" } });
      process.stdout.write("ready\\n"); setInterval(() => {}, 1000);`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", program, databasePath, root],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.once("data", () => resolve());
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`Child exited before starting: ${code}`)));
      });
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      const events = await createSqliteEventStore({ databasePath }).getEvents("half-failed");
      expect(events.map((event) => event.type)).toEqual(["run.started", "run.error", "run.failed"]);
      expect(events[1]?.payload).toMatchObject({ message: "Original failure" });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 15000);
});
