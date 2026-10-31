import { type LoadedProject, validateProject } from "@plico/core";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { diag } from "../diagnostic.js";

export interface ProjectCheck {
  diagnostics: ReadinessDiagnostic[];
  project: LoadedProject | undefined;
}

export async function checkProject(projectRoot: string): Promise<ProjectCheck> {
  const diagnostics: ReadinessDiagnostic[] = [];
  const validation = await validateProject(projectRoot);

  if (!validation.ok || !validation.project) {
    for (const issue of validation.errors ?? []) {
      diagnostics.push(diag("error", "project.structure", issue.message, issue.path));
    }
    for (const issue of validation.warnings ?? []) {
      diagnostics.push(diag("warning", "project.structure", issue.message, issue.path));
    }
    return { diagnostics, project: validation.project };
  }

  diagnostics.push(diag("ok", "project.structure", "Project is valid", "plico.config.ts"));
  for (const issue of validation.warnings ?? []) {
    diagnostics.push(diag("warning", "project.structure", issue.message, issue.path));
  }
  return { diagnostics, project: validation.project };
}
