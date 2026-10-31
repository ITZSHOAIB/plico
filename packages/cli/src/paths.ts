import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function resolveDatabasePath(target: string, dbPath: string | undefined): string {
  return dbPath ?? join(target, ".plico", "plico.sqlite");
}

export function findStudioPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve("@plico/studio/package.json")), "dist");
  } catch {
    return undefined;
  }
}

export async function ensureDatabaseExists(databasePath: string): Promise<void> {
  try {
    await access(databasePath, fsConstants.F_OK);
  } catch {
    throw new Error(`Missing database: ${databasePath}`);
  }
}

export function normalizeDisplayHost(host: string): string {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }

  return host;
}
