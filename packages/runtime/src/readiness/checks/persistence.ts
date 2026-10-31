import { access, constants } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";
import type { ReadinessDatabase } from "../open-database.js";

export async function checkPersistence(
  dbPath: string,
  database: ReadinessDatabase,
): Promise<ReadinessDiagnostic[]> {
  if (database.openError !== undefined) {
    return [cannotRead(database.openError, dbPath)];
  }

  if (database.eventStore) {
    try {
      await database.eventStore.listRuns();
    } catch (error) {
      return [cannotRead((error as Error).message, dbPath)];
    }
  }

  // An attached store is already open for writing, so only its reads need proving.
  if (database.attached) {
    return [makeDiagnostic("ok", "persistence.storage", "Event store is attached")];
  }

  if (database.eventStore) {
    const writable =
      (await exists(dbPath, constants.W_OK)) && (await exists(dirname(dbPath), constants.W_OK));
    return writable
      ? [makeDiagnostic("ok", "persistence.storage", "Database is writable", dbPath)]
      : [makeDiagnostic("error", "persistence.storage", "Database is not writable", dbPath)];
  }

  // Read-only probe: the database can be created later if the nearest existing
  // ancestor directory is writable. Readiness must never touch the filesystem.
  if (await isCreatable(dbPath)) {
    return [
      makeDiagnostic(
        "warning",
        "persistence.storage",
        "Database file does not exist yet but its location is writable. Run plico run --dry --persist to initialize.",
        dbPath,
      ),
    ];
  }

  return [
    makeDiagnostic("error", "persistence.storage", "Persistence path is not writable", dbPath),
  ];
}

function cannotRead(reason: string, dbPath: string): ReadinessDiagnostic {
  return makeDiagnostic(
    "error",
    "persistence.storage",
    `Database cannot be read: ${reason}`,
    dbPath,
  );
}

async function isCreatable(path: string): Promise<boolean> {
  let current = dirname(path);
  while (true) {
    if (await exists(current, constants.W_OK)) return true;
    if (await exists(current, constants.F_OK)) return false;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

async function exists(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}
