import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { createSqliteEventStore, runProject } from "../index.js";
import * as schema from "./sqlite/schema.js";

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
  it("replays identical appends without changing the log and rejects conflicting or terminal appends", async () => {
    const root = await scaffold();
    const store = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    const run = await runProject(root, { script, eventStore: store });
    const events = await store.getEvents(run.runId);
    const last = events.at(-1);
    if (!last) throw new Error("Expected terminal event");
    await store.appendEvent(last);
    expect(await store.getEvents(run.runId)).toEqual(events);
    await expect(store.appendEvent({ ...last, payload: { changed: true } })).rejects.toThrow(
      "Conflicting",
    );
    await expect(store.appendEvent({ ...last, sequence: last.sequence + 1 })).rejects.toThrow(
      "status completed",
    );
    expect(await store.getEvents(run.runId)).toEqual(events);
  });

  it("rejects an illegal event sequence without creating a run", async () => {
    const root = await scaffold();
    const store = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    const source = await runProject(root, { script });
    const event = source.events.find((item) => item.type === "run.completed");
    if (!event) throw new Error("Expected completed event");
    await expect(store.appendEvent({ ...event, sequence: 1 })).rejects.toThrow("first event");
    expect(await store.getRun(source.runId)).toBeUndefined();
    expect(await store.getEvents(source.runId)).toEqual([]);
  });
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
    const first = events[0];
    if (!first) throw new Error("Expected an event");
    await expect(eventStore.appendEvent({ ...first, streamId: "run-other" })).rejects.toThrow(
      "run stream",
    );

    expect(await eventStore.getEvents("run-other")).toEqual([]);
    expect(await eventStore.getEvents(runId)).toEqual(events);
    expect((await eventStore.getRun(runId))?.status).toBe(run?.status);
  });
});

describe("schema migrations", () => {
  function inject(steps: Array<{ from: number; to: number; sql: string }>) {
    const initialize = schema.initializeSchema;
    return vi.spyOn(schema, "initializeSchema").mockImplementation((database) => {
      initialize(database, steps);
    });
  }

  function createBaseline(databasePath: string) {
    const spy = inject([]);
    try {
      createSqliteEventStore({ databasePath });
    } finally {
      spy.mockRestore();
    }
  }

  it("preserves existing runs when upgrading to nullable end times", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    createBaseline(databasePath);
    const database = new DatabaseSync(databasePath);
    database
      .prepare(
        "INSERT INTO runs (run_id, project_root, project_name, status, started_at, ended_at, output) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("old-run", root, "Demo", "completed", "start", "end", "saved");
    database.close();
    const store = createSqliteEventStore({ databasePath });
    expect(await store.getRun("old-run")).toMatchObject({
      status: "completed",
      endedAt: "end",
      output: "saved",
    });
  });

  it("upgrades a baseline database and preserves the migration effect", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    createBaseline(databasePath);
    const migration = [{ from: 2, to: 3, sql: "CREATE TABLE migration_example (value TEXT);" }];
    const spy = inject(migration);
    try {
      createSqliteEventStore({ databasePath });
      const database = new DatabaseSync(databasePath, { readOnly: true });
      expect(
        database.prepare("SELECT value FROM plico_meta WHERE key = 'schema_version'").get(),
      ).toMatchObject({ value: "3" });
      expect(
        database.prepare("SELECT name FROM sqlite_master WHERE name = 'migration_example'").get(),
      ).toMatchObject({ name: "migration_example" });
      database.close();
    } finally {
      spy.mockRestore();
    }
  });

  it("does not repeat a migration when the store reopens", async () => {
    const databasePath = join(await scaffold(), "state.sqlite");
    createBaseline(databasePath);
    const spy = inject([
      {
        from: 2,
        to: 3,
        sql: "CREATE TABLE migration_example (value TEXT); INSERT INTO migration_example VALUES ('once');",
      },
    ]);
    try {
      createSqliteEventStore({ databasePath });
      createSqliteEventStore({ databasePath });
      const database = new DatabaseSync(databasePath, { readOnly: true });
      expect(
        database.prepare("SELECT value FROM plico_meta WHERE key = 'schema_version'").get(),
      ).toMatchObject({ value: "3" });
      expect(database.prepare("SELECT value FROM migration_example").all()).toEqual([
        { value: "once" },
      ]);
      database.close();
    } finally {
      spy.mockRestore();
    }
  });

  it("rolls back a failed migration and leaves its version unchanged", async () => {
    const databasePath = join(await scaffold(), "state.sqlite");
    createBaseline(databasePath);
    const spy = inject([
      {
        from: 2,
        to: 3,
        sql: "CREATE TABLE migration_example (value TEXT); INSERT INTO missing_table VALUES (1);",
      },
    ]);
    try {
      expect(() => createSqliteEventStore({ databasePath })).toThrow();
      const database = new DatabaseSync(databasePath, { readOnly: true });
      expect(
        database.prepare("SELECT value FROM plico_meta WHERE key = 'schema_version'").get(),
      ).toMatchObject({ value: "2" });
      expect(
        database.prepare("SELECT name FROM sqlite_master WHERE name = 'migration_example'").get(),
      ).toBeUndefined();
      database.close();
    } finally {
      spy.mockRestore();
    }
  });

  it("applies migrations in version order even when listed out of order", async () => {
    const databasePath = join(await scaffold(), "state.sqlite");
    createBaseline(databasePath);
    const spy = inject([
      { from: 3, to: 4, sql: "INSERT INTO migration_example VALUES ('second');" },
      {
        from: 2,
        to: 3,
        sql: "CREATE TABLE migration_example (value TEXT); INSERT INTO migration_example VALUES ('first');",
      },
    ]);
    try {
      createSqliteEventStore({ databasePath });
      const database = new DatabaseSync(databasePath, { readOnly: true });
      expect(
        database.prepare("SELECT value FROM plico_meta WHERE key = 'schema_version'").get(),
      ).toMatchObject({ value: "4" });
      expect(database.prepare("SELECT value FROM migration_example ORDER BY rowid").all()).toEqual([
        { value: "first" },
        { value: "second" },
      ]);
      database.close();
    } finally {
      spy.mockRestore();
    }
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
