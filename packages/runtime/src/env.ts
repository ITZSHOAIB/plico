import { existsSync } from "node:fs";
import { join } from "node:path";

const loaded = new Set<string>();

/**
 * Loads `<root>/.env` into `process.env` without replacing variables that are already set, and
 * returns the file path, or `undefined` when the project has none. Values are never logged.
 */
export function loadProjectEnv(root: string): string | undefined {
  const file = join(root, ".env");
  if (!existsSync(file)) return undefined;
  process.loadEnvFile(file);
  loaded.add(file);
  return file;
}

/** The `.env` files this process loaded through {@link loadProjectEnv}. */
export function loadedEnvFiles(): string[] {
  return [...loaded];
}
