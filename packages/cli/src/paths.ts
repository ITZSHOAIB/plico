import { existsSync, constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveDatabasePath(target: string, dbPath: string | undefined): string {
  return dbPath ?? join(target, ".plico", "plico.sqlite");
}

/** The Studio copied into the published package, else the workspace build when running from source. */
export function findStudioPath(): string | undefined {
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "studio");
  if (existsSync(join(bundled, "index.html"))) return bundled;
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve("@plico-ai/studio/package.json")), "dist");
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
