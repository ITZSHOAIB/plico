import { createEngine, type EngineOptions } from "./engine.js";
import { createSqliteJournal } from "./sqlite-journal.js";
import type { Engine } from "./types.js";

export interface SqliteEngineOptions extends Omit<EngineOptions, "journal"> {
  databasePath: string;
}

/** The local engine: runs survive a restart because the journal lives in the project's SQLite file. */
export function createSqliteEngine({ databasePath, ...options }: SqliteEngineOptions): Engine {
  return createEngine({ ...options, journal: createSqliteJournal({ databasePath }) });
}
