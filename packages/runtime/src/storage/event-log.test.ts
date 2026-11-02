import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { RunSummary } from "@plico/contracts";
import { describe, expect, it } from "vitest";
import { createSqliteEventStore, runProject } from "../index.js";

const script = [{ type: "assistant.output" as const, content: "Hi" }];
const execFileAsync = promisify(execFile);

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-event-log-"));
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

describe("event log streams", () => {
  it("initializes safely when multiple processes open the same new store", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
    const program = `import { createSqliteEventStore } from ${JSON.stringify(moduleUrl)}; await createSqliteEventStore({ databasePath: process.argv[1] }).listRuns();`;

    await Promise.all(
      Array.from({ length: 4 }, () =>
        execFileAsync(process.execPath, [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          program,
          databasePath,
        ]),
      ),
    );
    const store = createSqliteEventStore({ databasePath });
    const run = await runProject(root, { script, eventStore: store });
    expect((await createSqliteEventStore({ databasePath }).getRun(run.runId))?.runId).toBe(
      run.runId,
    );
  });
  it("files run events under the run's stream, surviving a store reopen", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const { runId } = await runProject(root, {
      script,
      eventStore: createSqliteEventStore({ databasePath }),
    });

    const events = await createSqliteEventStore({ databasePath }).getEvents(runId);

    expect(events).not.toEqual([]);
    for (const event of events) {
      expect(event).toMatchObject({ streamType: "run", streamId: runId, runId });
    }
  });

  it("counts sequence separately for each stream", async () => {
    const root = await scaffold();
    const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    const first = await runProject(root, { script, eventStore });
    const second = await runProject(root, { script, eventStore });

    expect((await eventStore.getEvents(first.runId))[0]?.sequence).toBe(1);
    expect((await eventStore.getEvents(second.runId))[0]?.sequence).toBe(1);
  });

  it("refuses events filed under another stream and stores nothing", async () => {
    const root = await scaffold();
    const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    const { runId } = await runProject(root, { script, eventStore });
    const run = await eventStore.getRun(runId);
    const events = await eventStore.getEvents(runId);
    const misfiled = events.map((event) => ({ ...event, streamId: "run-other" }));

    await expect(
      eventStore.persistRun({ ...(run as RunSummary), status: "failed", events: misfiled }),
    ).rejects.toThrow("run-other");

    expect(await eventStore.getEvents("run-other")).toEqual([]);
    expect(await eventStore.getEvents(runId)).toEqual(events);
    expect((await eventStore.getRun(runId))?.status).toBe(run?.status);
  });
});

describe("older databases", () => {
  it("refuses to open one with a clear message and leaves it untouched", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE plico_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO plico_meta (key, value) VALUES ('schema_version', '1');
    `);
    database.close();

    expect(() => createSqliteEventStore({ databasePath })).toThrow("older schema");

    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    const row = reopened.prepare("SELECT value FROM plico_meta").get();
    expect(row).toMatchObject({ value: "1" });
  });
});

describe("newer databases", () => {
  it("refuses to open a database from a newer Plico version without changing it", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE plico_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO plico_meta (key, value) VALUES ('schema_version', '999');
    `);
    database.close();

    expect(() => createSqliteEventStore({ databasePath })).toThrow("newer schema");

    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    expect(reopened.prepare("SELECT value FROM plico_meta").get()).toMatchObject({ value: "999" });
    reopened.close();
  });
});
