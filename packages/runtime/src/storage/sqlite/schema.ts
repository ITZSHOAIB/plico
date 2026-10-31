import type { DatabaseSync } from "node:sqlite";

export function initializeSchema(database: DatabaseSync): void {
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
    CREATE TABLE IF NOT EXISTS eval_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluated_at TEXT NOT NULL,
      report_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_run_sequence_index ON events(run_id, sequence);
    CREATE INDEX IF NOT EXISTS runs_started_at_index ON runs(started_at);
  `);
  database
    .prepare("INSERT OR REPLACE INTO plico_meta(key, value) VALUES ('schema_version', '1')")
    .run();
}
