import type { ReadinessDiagnostic, ReadinessOptions, ReadinessReport } from "../types/index.js";
import { checkArtifacts } from "./checks/artifacts.js";
import { checkEvals } from "./checks/evals.js";
import { checkPersistence } from "./checks/persistence.js";
import { checkProject } from "./checks/project.js";
import { checkServerConfig } from "./checks/server-config.js";
import { checkTools } from "./checks/tools.js";

export async function checkReadiness(
  projectRoot: string,
  options: ReadinessOptions = {},
): Promise<ReadinessReport> {
  const projectCheck = await checkProject(projectRoot);
  const diagnostics: ReadinessDiagnostic[] = [...projectCheck.diagnostics];

  if (!projectCheck.project) {
    return summarize(projectRoot, diagnostics);
  }

  diagnostics.push(
    ...(await checkTools(projectCheck.project)),
    ...(await checkEvals(projectRoot, options.eventStore)),
    ...(await checkPersistence(
      projectRoot,
      options.databasePath,
      options.eventStore !== undefined,
    )),
    ...(await checkArtifacts(projectRoot)),
    ...(await checkServerConfig(projectRoot)),
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
