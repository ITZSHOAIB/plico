import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

type SqliteSource = ConstructorParameters<typeof DatabaseSync>[0];
type SqliteOptions = ConstructorParameters<typeof DatabaseSync>[1];

const require = createRequire(import.meta.url);
let sqlite: typeof import("node:sqlite") | undefined;

/**
 * Opens a SQLite database, loading `node:sqlite` on first use. Importing it eagerly would print
 * Node's experimental warning for commands that never touch a database, such as `--version`.
 */
export function createDatabase(path: SqliteSource, options?: SqliteOptions): DatabaseSync {
  sqlite ??= require("node:sqlite") as typeof import("node:sqlite");
  return options === undefined
    ? new sqlite.DatabaseSync(path)
    : new sqlite.DatabaseSync(path, options);
}
