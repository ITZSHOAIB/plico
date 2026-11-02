import { randomUUID } from "node:crypto";
import { rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

let current: { token: string; path: string; database: DatabaseSync } | undefined;

function lockPath(token: string): string {
  return join(tmpdir(), `plico-run-owner-${token}.sqlite`);
}

export function currentOwner(): { token: string; path: string } {
  if (current) return current;
  const token = randomUUID();
  const path = lockPath(token);
  const database = new DatabaseSync(path);
  // SQLite releases this process-owned lock on exit, even when a PID is reused.
  database.exec("CREATE TABLE owner_lock (id INTEGER); BEGIN EXCLUSIVE;");
  current = { token, path, database };
  process.once("exit", () => {
    try {
      database.close();
      rmSync(path, { force: true });
    } catch {
      /* OS cleanup may happen later. */
    }
  });
  return current;
}

export function ownerIsAlive(token: string, path: string): boolean {
  if (current?.token === token) return true;
  if (!/^[a-f0-9-]{36}$/.test(token) || basename(path) !== `plico-run-owner-${token}.sqlite`)
    return true;
  try {
    statSync(path);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
  let probe: DatabaseSync | undefined;
  try {
    probe = new DatabaseSync(path, { readOnly: true });
    probe.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE; ROLLBACK;");
    return false;
  } catch {
    // An inaccessible or locked owner file is treated as live to avoid failing an active run.
    return true;
  } finally {
    probe?.close();
  }
}
