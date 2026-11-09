import { access } from "node:fs/promises";
import { getProjectPaths, getProjectRelativePaths } from "@plico-ai/core";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

/**
 * Files a run writes are events in the log (ADR 0002), not files in `artifacts/`, so the folder
 * is only part of the project layout. Its writability says nothing about artifacts and is not checked.
 */
export async function checkArtifacts(projectRoot: string): Promise<ReadinessDiagnostic[]> {
  const directory = getProjectPaths(projectRoot).directories.artifacts;
  const folder = `${getProjectRelativePaths().directories.artifacts}/`;

  try {
    await access(directory);
  } catch {
    return [
      makeDiagnostic(
        "warning",
        "artifacts.workspace",
        `${folder} directory not found. Create it to keep the project layout complete.`,
      ),
    ];
  }

  return [
    makeDiagnostic(
      "ok",
      "artifacts.workspace",
      "Artifacts a run writes are stored in the event log, not in this folder",
      folder,
    ),
  ];
}
