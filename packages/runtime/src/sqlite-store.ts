import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateSqliteEventStoreOptions,
  EventStore,
  PersistedRun,
  PlicoEvent,
  RunStatus,
  RunSummary,
} from "./types.js";

export function createSqliteEventStore({
  databasePath,
}: CreateSqliteEventStoreOptions): EventStore {
  mkdirSyncParent(databasePath);
  const database = new DatabaseSync(databasePath);
  initializeSchema(database);

  return {
    async persistRun(run: PersistedRun): Promise<void> {
      persistRunRecord(database, run);
    },
    async listRuns(): Promise<RunSummary[]> {
      return readRunSummaries(database);
    },
    async getRun(runId: string): Promise<RunSummary | undefined> {
      return readRunSummary(database, runId);
    },
    async getEvents(
      runId: string,
      options: { afterSequence?: number } = {},
    ): Promise<PlicoEvent[]> {
      return readEvents(database, runId, options.afterSequence);
    },
  };
}

function mkdirSyncParent(databasePath: string): void {
  mkdirSync(dirname(databasePath), { recursive: true });
}

function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS plico_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      project_root TEXT NOT NULL,
      project_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      output TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (run_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS events_run_sequence_index ON events(run_id, sequence);
    CREATE INDEX IF NOT EXISTS runs_started_at_index ON runs(started_at);
  `);
  database
    .prepare("INSERT OR REPLACE INTO plico_meta(key, value) VALUES ('schema_version', '1')")
    .run();
}

function persistRunRecord(database: DatabaseSync, run: PersistedRun): void {
  const insertRun = database.prepare(`
    INSERT INTO runs (run_id, project_root, project_name, status, started_at, ended_at, output)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      project_root = excluded.project_root,
      project_name = excluded.project_name,
      status = excluded.status,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      output = excluded.output
  `);
  const deleteEvents = database.prepare("DELETE FROM events WHERE run_id = ?");
  const insertEvent = database.prepare(`
    INSERT INTO events (
      run_id,
      sequence,
      event_id,
      schema_version,
      type,
      timestamp,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  try {
    insertRun.run(
      run.runId,
      run.projectRoot,
      run.projectName,
      run.status,
      run.startedAt,
      run.endedAt,
      run.output ?? null,
    );
    deleteEvents.run(run.runId);
    for (const event of run.events) {
      insertEvent.run(
        event.runId,
        event.sequence,
        event.id,
        event.schemaVersion,
        event.type,
        event.timestamp,
        JSON.stringify(event.payload),
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function readRunSummaries(database: DatabaseSync): RunSummary[] {
  const rows = database
    .prepare(
      `
        SELECT run_id, project_root, project_name, status, started_at, ended_at, output
        FROM runs
        ORDER BY started_at DESC, run_id DESC
      `,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => rowToRunSummary(row));
}

function readRunSummary(database: DatabaseSync, runId: string): RunSummary | undefined {
  const row = database
    .prepare(
      `
        SELECT run_id, project_root, project_name, status, started_at, ended_at, output
        FROM runs
        WHERE run_id = ?
      `,
    )
    .get(runId) as Record<string, unknown> | undefined;

  return row ? rowToRunSummary(row) : undefined;
}

function readEvents(
  database: DatabaseSync,
  runId: string,
  afterSequence: number | undefined,
): PlicoEvent[] {
  const rows = database
    .prepare(
      `
        SELECT run_id, sequence, event_id, schema_version, type, timestamp, payload_json
        FROM events
        WHERE run_id = ? AND sequence > ?
        ORDER BY sequence ASC
      `,
    )
    .all(runId, afterSequence ?? 0) as Array<Record<string, unknown>>;

  return rows.map((row) => rowToEvent(row));
}

function rowToRunSummary(row: Record<string, unknown>): RunSummary {
  return {
    runId: String(row.run_id),
    projectRoot: String(row.project_root),
    projectName: String(row.project_name),
    status: row.status as RunStatus,
    startedAt: String(row.started_at),
    endedAt: String(row.ended_at),
    ...(row.output === null || row.output === undefined ? {} : { output: String(row.output) }),
  };
}

function rowToEvent(row: Record<string, unknown>): PlicoEvent {
  return {
    schemaVersion: 1,
    runId: String(row.run_id),
    id: String(row.event_id),
    sequence: Number(row.sequence),
    timestamp: String(row.timestamp),
    type: row.type as PlicoEvent["type"],
    payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>,
  };
}
