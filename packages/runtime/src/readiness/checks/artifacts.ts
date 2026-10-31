import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

async function canAccess(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

export async function checkArtifacts(projectRoot: string): Promise<ReadinessDiagnostic[]> {
  const directory = join(projectRoot, "artifacts");

  if (!(await canAccess(directory, constants.F_OK))) {
    return [
      makeDiagnostic(
        "warning",
        "artifacts.workspace",
        "artifacts/ directory not found. Create it to store generated outputs.",
      ),
    ];
  }

  if (!(await canAccess(directory, constants.W_OK))) {
    return [
      makeDiagnostic(
        "error",
        "artifacts.workspace",
        "Artifact workspace directory is not writable",
        "artifacts/",
      ),
    ];
  }

  return [
    makeDiagnostic(
      "ok",
      "artifacts.workspace",
      "Artifact workspace directory is writable",
      "artifacts/",
    ),
  ];
}
