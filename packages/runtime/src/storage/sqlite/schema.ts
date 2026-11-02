import type { DatabaseSync } from "node:sqlite";

const baselineVersion = 2;
const migrations: ReadonlyArray<{ from: number; to: number; sql: string }> = [
  {
    from: 2,
    to: 3,
    sql: `
    CREATE TABLE runs_new (
      run_id TEXT PRIMARY KEY, project_root TEXT NOT NULL, project_name TEXT NOT NULL,
      status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, output TEXT
    );
    INSERT INTO runs_new SELECT run_id, project_root, project_name, status, started_at, ended_at, output FROM runs;
    DROP TABLE runs;
    ALTER TABLE runs_new RENAME TO runs;
    CREATE INDEX runs_started_at_index ON runs(started_at);
  `,
  },
  {
    from: 3,
    to: 4,
    sql: `CREATE TABLE run_owners (run_id TEXT PRIMARY KEY, process_id INTEGER NOT NULL, owner_token TEXT NOT NULL, owner_path TEXT NOT NULL);`,
  },
  {
    // The execution engine's journal. These tables are private to the engine.
    from: 4,
    to: 5,
    sql: `
    CREATE TABLE engine_runs (
      run_id TEXT PRIMARY KEY, state TEXT NOT NULL, input_json TEXT NOT NULL,
      worker_id TEXT NOT NULL, lease_until INTEGER NOT NULL,
      owner_token TEXT NOT NULL, owner_path TEXT NOT NULL
    );
    CREATE TABLE engine_steps (
      run_id TEXT NOT NULL, step_index INTEGER NOT NULL, name TEXT NOT NULL, result_json TEXT NOT NULL,
      PRIMARY KEY (run_id, step_index)
    );
  `,
  },
  {
    from: 5,
    to: 6,
    sql: `
    CREATE TABLE engine_waits (
      run_id TEXT NOT NULL, name TEXT NOT NULL, deadline INTEGER, outcome_json TEXT,
      PRIMARY KEY (run_id, name)
    );
    CREATE TABLE engine_signals (
      run_id TEXT NOT NULL, name TEXT NOT NULL, value_json TEXT NOT NULL,
      PRIMARY KEY (run_id, name)
    );
  `,
  },
];

function readSchemaVersion(
  database: DatabaseSync,
  sqliteSchemaVersion: number,
): number | undefined {
  const row = database.prepare("SELECT value FROM plico_meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (!row) return undefined;
  const version = Number(row.value);
  if (!Number.isSafeInteger(version) || version < 1 || String(version) !== row.value) {
    throw new Error(`Database has an invalid schema version (${row.value}).`);
  }
  if (version > sqliteSchemaVersion) {
    throw new Error(`Database uses a newer schema (${version}, supported ${sqliteSchemaVersion}).`);
  }
  return version;
}

export function initializeSchema(
  database: DatabaseSync,
  steps: typeof migrations = migrations,
): void {
  const ordered = [...steps].sort((a, b) => a.from - b.from);
  const sqliteSchemaVersion = ordered.at(-1)?.to ?? baselineVersion;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS plico_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    let current = readSchemaVersion(database, sqliteSchemaVersion);
    if (current === undefined) {
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
        .prepare("INSERT INTO plico_meta(key, value) VALUES ('schema_version', ?)")
        .run(String(baselineVersion));
      current = baselineVersion;
    }
    while (current < sqliteSchemaVersion) {
      const migration = ordered.find((item) => item.from === current);
      if (!migration || migration.to <= current) {
        throw new Error(
          `Database uses an older schema (${current}) with no supported migration. Delete it or choose another path with --db.`,
        );
      }
      database.exec(migration.sql);
      current = migration.to;
      database
        .prepare("UPDATE plico_meta SET value = ? WHERE key = 'schema_version'")
        .run(String(current));
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
