import type { DatabaseSync } from "node:sqlite";
import { ownerIsAlive } from "./owner-lock.js";

export function recoverInterruptedRuns(database: DatabaseSync): void {
  if (
    !database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'run_owners'")
      .get()
  )
    return;
  if (!database.prepare("SELECT 1 FROM runs WHERE status = 'running' LIMIT 1").get()) return;
  // Runs the engine journals resume from the journal instead of failing; see engine.recover.
  database.exec("BEGIN IMMEDIATE");
  try {
    const rows = database
      .prepare(`
      SELECT runs.run_id, run_owners.owner_token, run_owners.owner_path FROM runs
      LEFT JOIN run_owners ON run_owners.run_id = runs.run_id
      WHERE runs.status = 'running'
        AND runs.run_id NOT IN (SELECT run_id FROM engine_runs)
    `)
      .all() as Array<{ run_id: string; owner_token: string | null; owner_path: string | null }>;
    // The write transaction serializes recovery with concurrent event appends and other openers.
    for (const row of rows) {
      if (
        row.owner_token !== null &&
        row.owner_path !== null &&
        ownerIsAlive(row.owner_token, row.owner_path)
      )
        continue;
      // A running row always has run.started because both are written in one transaction.
      const last = database
        .prepare(
          "SELECT sequence, type FROM events WHERE stream_type = 'run' AND stream_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(row.run_id) as { sequence: number; type: string };
      let sequence = last.sequence;
      const timestamp = new Date().toISOString();
      const insert = database.prepare(
        "INSERT INTO events (stream_type, stream_id, sequence, event_id, schema_version, type, timestamp, payload_json) VALUES ('run', ?, ?, ?, 1, ?, ?, ?)",
      );
      // Event IDs follow the sequence-based scheme defined in runtime/src/events.ts.
      if (last.type !== "run.error") {
        sequence += 1;
        insert.run(
          row.run_id,
          sequence,
          `evt-${String(sequence).padStart(4, "0")}`,
          "run.error",
          timestamp,
          JSON.stringify({ phase: "runtime", message: "Run interrupted by process exit." }),
        );
      }
      sequence += 1;
      insert.run(
        row.run_id,
        sequence,
        `evt-${String(sequence).padStart(4, "0")}`,
        "run.failed",
        timestamp,
        JSON.stringify({ phase: "runtime" }),
      );
      database
        .prepare(
          "UPDATE runs SET status = 'failed', ended_at = ? WHERE run_id = ? AND status = 'running'",
        )
        .run(timestamp, row.run_id);
      database.prepare("DELETE FROM run_owners WHERE run_id = ?").run(row.run_id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
