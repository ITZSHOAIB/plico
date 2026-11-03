import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../storage/sqlite/open.js";
import { acquireOwner, ownerIsAlive } from "../storage/sqlite/owner-lock.js";
import type { Journal, JournalRun, Lease } from "./journal.js";
import type { ExecutionState } from "./types.js";

interface RunRow {
  run_id: string;
  state: ExecutionState;
  input_json: string;
  worker_id: string;
  lease_until: number;
  owner_token: string;
  owner_path: string;
  cancel_requested: number;
}

function leaseOf(row: RunRow): Lease {
  return { workerId: row.worker_id, until: row.lease_until };
}

/** Keeps the journal in the project's SQLite file, in tables private to the engine. */
export function createSqliteJournal({ databasePath }: { databasePath: string }): Journal {
  const database: DatabaseSync = openDatabase(databasePath);

  function readRun(runId: string): RunRow | undefined {
    return database.prepare("SELECT * FROM engine_runs WHERE run_id = ?").get(runId) as
      | RunRow
      | undefined;
  }

  return {
    async begin(runId, inputJson, lease) {
      const owner = acquireOwner();
      const result = database
        .prepare(
          "INSERT OR IGNORE INTO engine_runs (run_id, state, input_json, worker_id, lease_until, owner_token, owner_path) VALUES (?, 'running', ?, ?, ?, ?, ?)",
        )
        .run(runId, inputJson, lease.workerId, lease.until, owner.token, owner.path);
      return result.changes === 1;
    },
    async getRun(runId): Promise<JournalRun | undefined> {
      const row = readRun(runId);
      return (
        row && {
          runId,
          state: row.state,
          inputJson: row.input_json,
          cancelRequested: row.cancel_requested === 1,
        }
      );
    },
    async setState(runId, state) {
      database.prepare("UPDATE engine_runs SET state = ? WHERE run_id = ?").run(state, runId);
    },
    async renew(runId, lease) {
      database
        .prepare("UPDATE engine_runs SET lease_until = ? WHERE run_id = ? AND worker_id = ?")
        .run(lease.until, runId, lease.workerId);
    },
    async claim(runId, lease, expected) {
      const owner = acquireOwner();
      const result = expected
        ? database
            .prepare(
              "UPDATE engine_runs SET state = 'running', worker_id = ?, lease_until = ?, owner_token = ?, owner_path = ? WHERE run_id = ? AND worker_id = ? AND lease_until = ?",
            )
            .run(
              lease.workerId,
              lease.until,
              owner.token,
              owner.path,
              runId,
              expected.workerId,
              expected.until,
            )
        : database
            .prepare(
              "UPDATE engine_runs SET state = 'running', worker_id = ?, lease_until = ?, owner_token = ?, owner_path = ? WHERE run_id = ?",
            )
            .run(lease.workerId, lease.until, owner.token, owner.path, runId);
      return result.changes === 1;
    },
    async claimWaiting(runId, lease, expected) {
      const owner = acquireOwner();
      const sql = `UPDATE engine_runs SET state = 'running', worker_id = ?, lease_until = ?, owner_token = ?, owner_path = ? WHERE run_id = ? AND state = 'waiting'`;
      const result = expected
        ? database
            .prepare(`${sql} AND worker_id = ? AND lease_until = ?`)
            .run(
              lease.workerId,
              lease.until,
              owner.token,
              owner.path,
              runId,
              expected.workerId,
              expected.until,
            )
        : database.prepare(sql).run(lease.workerId, lease.until, owner.token, owner.path, runId);
      return result.changes === 1;
    },
    async listStale(workerId, now) {
      const rows = database
        .prepare("SELECT * FROM engine_runs WHERE state = 'running' AND worker_id != ?")
        .all(workerId) as unknown as RunRow[];
      // A dead process is recovered at the next start; a live one only after its lease runs out.
      return rows
        .filter((row) => row.lease_until < now || !ownerIsAlive(row.owner_token, row.owner_path))
        .map((row) => ({ runId: row.run_id, held: leaseOf(row) }));
    },
    async listReady(now) {
      const rows = database
        .prepare(`
          SELECT DISTINCT r.* FROM engine_runs r
          JOIN engine_waits w ON w.run_id = r.run_id AND w.outcome_json IS NULL
          WHERE r.state = 'waiting' AND (
            r.cancel_requested = 1 OR w.deadline <= ? OR EXISTS (
              SELECT 1 FROM engine_signals s WHERE s.run_id = w.run_id AND s.name = w.name
            )
          )
        `)
        .all(now) as unknown as RunRow[];
      return rows.map((row) => ({ runId: row.run_id, held: leaseOf(row) }));
    },
    async listWaiting() {
      const rows = database
        .prepare(`SELECT r.run_id, w.deadline FROM engine_runs r
        JOIN engine_waits w ON w.run_id = r.run_id AND w.outcome_json IS NULL
        WHERE r.state = 'waiting'`)
        .all() as Array<{ run_id: string; deadline: number | null }>;
      return rows.map((row) => ({ runId: row.run_id, deadline: row.deadline }));
    },
    async requestCancel(runId) {
      const result = database
        .prepare(
          "UPDATE engine_runs SET cancel_requested = 1 WHERE run_id = ? AND cancel_requested = 0 AND state IN ('running', 'waiting')",
        )
        .run(runId);
      return result.changes === 1;
    },
    async getWait(runId, name) {
      const row = database
        .prepare("SELECT deadline, outcome_json FROM engine_waits WHERE run_id = ? AND name = ?")
        .get(runId, name) as { deadline: number | null; outcome_json: string | null } | undefined;
      return row && { deadline: row.deadline, outcomeJson: row.outcome_json };
    },
    async openWait(runId, name, deadline) {
      database
        .prepare("INSERT OR IGNORE INTO engine_waits (run_id, name, deadline) VALUES (?, ?, ?)")
        .run(runId, name, deadline);
    },
    async resolveWait(runId, name, outcomeJson) {
      const result = database
        .prepare(
          "UPDATE engine_waits SET outcome_json = ? WHERE run_id = ? AND name = ? AND outcome_json IS NULL",
        )
        .run(outcomeJson, runId, name);
      return result.changes === 1;
    },
    async putSignal(runId, name, valueJson) {
      const result = database
        .prepare("INSERT OR IGNORE INTO engine_signals (run_id, name, value_json) VALUES (?, ?, ?)")
        .run(runId, name, valueJson);
      return result.changes === 1;
    },
    async getSignal(runId, name) {
      const row = database
        .prepare("SELECT value_json FROM engine_signals WHERE run_id = ? AND name = ?")
        .get(runId, name) as { value_json: string } | undefined;
      return row?.value_json;
    },
    async getStep(runId, index) {
      const row = database
        .prepare("SELECT name, result_json FROM engine_steps WHERE run_id = ? AND step_index = ?")
        .get(runId, index) as { name: string; result_json: string } | undefined;
      return row && { name: row.name, resultJson: row.result_json };
    },
    async putStep(runId, index, step) {
      database
        .prepare(
          "INSERT OR IGNORE INTO engine_steps (run_id, step_index, name, result_json) VALUES (?, ?, ?, ?)",
        )
        .run(runId, index, step.name, step.resultJson);
    },
  };
}
