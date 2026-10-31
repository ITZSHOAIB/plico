import { join } from "node:path";
import type { ReadinessDiagnostic, ReadinessOptions, ReadinessReport } from "../types/index.js";
import { checkArtifacts } from "./checks/artifacts.js";
import { checkEvals } from "./checks/evals.js";
import { checkPersistence } from "./checks/persistence.js";
import { checkProject } from "./checks/project.js";
import { checkServerConfig } from "./checks/server-config.js";
import { checkStudio } from "./checks/studio.js";
import { checkTools } from "./checks/tools.js";
import { openDatabase } from "./open-database.js";

export async function checkReadiness(
  projectRoot: string,
  options: ReadinessOptions = {},
): Promise<ReadinessReport> {
  const projectCheck = await checkProject(projectRoot);
  const diagnostics: ReadinessDiagnostic[] = [...projectCheck.diagnostics];

  if (!projectCheck.project) {
    return summarize(projectRoot, diagnostics);
  }

  const databasePath = options.databasePath ?? join(projectRoot, ".plico", "plico.sqlite");
  const database = openDatabase(databasePath, options.eventStore);

  diagnostics.push(
    ...(await checkTools(projectCheck.project)),
    ...(await checkEvals(projectRoot, database.eventStore)),
    ...(await checkPersistence(databasePath, database)),
    ...(await checkArtifacts(projectRoot)),
    ...(await checkServerConfig(projectRoot)),
    ...(await checkStudio(options.studioPath)),
  );

  return summarize(projectRoot, diagnostics);
}

function summarize(projectRoot: string, diagnostics: ReadinessDiagnostic[]): ReadinessReport {
  const count = (severity: ReadinessDiagnostic["severity"]): number =>
    diagnostics.filter((d) => d.severity === severity).length;

  return {
    projectRoot,
    timestamp: new Date().toISOString(),
    diagnostics,
    summary: { ok: count("ok"), warning: count("warning"), error: count("error") },
  };
}
