import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { checkReadOnlySchema, initializeSchema } from "./schema.js";

/** Opens the database with the pragma order and migrator every Plico store shares. */
export function openDatabase(databasePath: string, readOnly = false): DatabaseSync {
  if (!readOnly) mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(readOnly ? readOnlySource(databasePath) : databasePath, {
    readOnly,
  });
  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    if (!readOnly) {
      setWalMode(database);
      initializeSchema(database);
    } else {
      checkReadOnlySchema(database);
    }
  } catch (error) {
    database.close();
    throw error;
  }
  return database;
}

function setWalMode(database: DatabaseSync): void {
  // Changing journal mode may return SQLITE_BUSY immediately even with busy_timeout set.
  const deadline = Date.now() + 5000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      database.exec("PRAGMA journal_mode = WAL;");
      return;
    } catch (error) {
      const code = (error as { errcode?: number }).errcode;
      if (code === undefined || (code & 0xff) !== 5 || Date.now() >= deadline) throw error;
      Atomics.wait(pause, 0, 0, Math.min(25, deadline - Date.now()));
    }
  }
}

// A plain read-only open of a WAL database creates -shm and -wal files. Immutable mode
// avoids them but ignores WAL content, so it is only safe when no -wal file exists.
function readOnlySource(databasePath: string): string | URL {
  if (existsSync(`${databasePath}-wal`)) return databasePath;

  const url = pathToFileURL(databasePath);
  url.searchParams.set("immutable", "1");
  return url;
}
