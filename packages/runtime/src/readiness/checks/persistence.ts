import { access, constants, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { diag } from "../diagnostic.js";

export async function checkPersistence(
  projectRoot: string,
  databasePath: string | undefined,
): Promise<ReadinessDiagnostic[]> {
  const dbPath = databasePath ?? join(projectRoot, ".plico", "plico.sqlite");
  try {
    await access(dbPath, constants.F_OK);
    return [diag("ok", "persistence.storage", "Database is readable", dbPath)];
  } catch {
    try {
      const dbDir = join(projectRoot, ".plico");
      await mkdir(dbDir, { recursive: true });
      const probe = join(dbDir, ".probe");
      await writeFile(probe, "");
      await access(probe, constants.F_OK);
      return [
        diag(
          "warning",
          "persistence.storage",
          "Database file does not exist yet but .plico/ is writable. Run plico run --dry --persist to initialize.",
          dbPath,
        ),
      ];
    } catch {
      return [diag("error", "persistence.storage", "Persistence path is not writable", dbPath)];
    }
  }
}
