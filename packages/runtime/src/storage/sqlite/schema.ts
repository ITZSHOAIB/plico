import type { DatabaseSync } from "node:sqlite";

const sqliteSchemaVersion = "2";

function assertCurrentSchema(database: DatabaseSync): void {
  const row = database.prepare("SELECT value FROM plico_meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (row && row.value !== sqliteSchemaVersion) {
    throw new Error(
      `Database uses an older schema (${row.value}, expected ${sqliteSchemaVersion}). Delete it or choose another path with --db.`,
    );
  }
}

export function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS plico_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  assertCurrentSchema(database);
  // `position` is the log-wide order from ADR 0007. Nothing reads it yet; it exists now so that
  // thread streams need no second migration. It stays internal: public cursors are per stream.
  database.exec(`
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
      position INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_type TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE (stream_type, stream_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS eval_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluated_at TEXT NOT NULL,
      report_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_started_at_index ON runs(started_at);
  `);
  database
    .prepare("INSERT OR REPLACE INTO plico_meta(key, value) VALUES ('schema_version', ?)")
    .run(sqliteSchemaVersion);
}
