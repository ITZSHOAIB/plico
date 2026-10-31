import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSqliteEventStore, runProject } from "../index.js";

const script = [{ type: "assistant.output" as const, content: "Hi" }];

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

  it("keeps sequence per stream and a log-wide position across streams", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    const first = await runProject(root, { script, eventStore });
    const second = await runProject(root, { script, eventStore });

    expect((await eventStore.getEvents(second.runId))[0]?.sequence).toBe(1);

    const rows = new DatabaseSync(databasePath, { readOnly: true })
      .prepare("SELECT stream_id FROM events ORDER BY position ASC")
      .all() as Array<{ stream_id: string }>;
    const streams = rows.map((row) => row.stream_id);
    expect(streams.lastIndexOf(first.runId)).toBeLessThan(streams.indexOf(second.runId));
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
