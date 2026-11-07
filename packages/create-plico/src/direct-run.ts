import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True when this module is the script node was started with. npm and pnpm reach a bin through a
 * symlink, so compare resolved paths rather than the raw `argv[1]` and module URL.
 */
export function isDirectRun(moduleUrl: string, entry: string | undefined): boolean {
  if (!entry) return false;
  try {
    return realpathSync.native(entry) === realpathSync.native(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
