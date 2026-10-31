import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkArtifacts(projectRoot: string): Promise<ReadinessDiagnostic[]> {
  try {
    await access(join(projectRoot, "artifacts"), constants.F_OK);
    return [
      makeDiagnostic(
        "ok",
        "artifacts.workspace",
        "Artifact workspace directory exists",
        "artifacts/",
      ),
    ];
  } catch {
    return [
      makeDiagnostic(
        "warning",
        "artifacts.workspace",
        "artifacts/ directory not found. Create it to store generated outputs.",
      ),
    ];
  }
}
