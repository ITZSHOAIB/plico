import { access, constants } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { diag } from "../diagnostic.js";

export async function checkPersistence(
  projectRoot: string,
  databasePath: string | undefined,
  hasEventStore = false,
): Promise<ReadinessDiagnostic[]> {
  if (hasEventStore) {
    return [diag("ok", "persistence.storage", "Event store is attached")];
  }

  const dbPath = databasePath ?? join(projectRoot, ".plico", "plico.sqlite");
  if (await exists(dbPath, constants.F_OK)) {
    return [diag("ok", "persistence.storage", "Database is readable", dbPath)];
  }

  // Read-only probe: the database can be created later if the nearest existing
  // ancestor directory is writable. Readiness must never touch the filesystem.
  if (await isCreatable(dbPath)) {
    return [
      diag(
        "warning",
        "persistence.storage",
        "Database file does not exist yet but its location is writable. Run plico run --dry --persist to initialize.",
        dbPath,
      ),
    ];
  }

  return [diag("error", "persistence.storage", "Persistence path is not writable", dbPath)];
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
