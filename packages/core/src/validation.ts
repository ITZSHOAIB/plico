import { readFile, stat } from "node:fs/promises";
import { loadProject } from "./config.js";
import { missingFileMessage, missingFileMessageFor, ProjectConfigError } from "./errors.js";
import {
  getProjectPaths,
  getProjectRelativePaths,
  REQUIRED_PROJECT_DIRECTORIES,
} from "./layout.js";
import type { LoadedProject, ValidationIssue, ValidationResult } from "./types.js";

export async function validateProject(root: string): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const relativePaths = getProjectRelativePaths();
  const projectPaths = getProjectPaths(root);

  let project: LoadedProject | undefined;
  try {
    project = await loadProject(root);
  } catch (error) {
    if (error instanceof ProjectConfigError) {
      errors.push(...error.issues);
    } else {
      errors.push({
        path: relativePaths.configFile,
        message: missingFileMessage(error),
        severity: "error",
      });
    }
    return {
      ok: false,
      issues: [...errors, ...warnings],
      errors,
      warnings,
    };
  }

  let agentText: string | undefined;
  try {
    agentText = await readFile(projectPaths.agentFile, "utf8");
  } catch (error) {
    errors.push({
      path: relativePaths.agentFile,
      message: missingFileMessageFor(relativePaths.agentFile, error),
      severity: "error",
    });
  }

  if (typeof agentText === "string") {
    if (agentText.trim().length === 0) {
      errors.push({
        path: relativePaths.agentFile,
        message: `${relativePaths.agentFile} must not be empty`,
        severity: "error",
      });
    } else {
      const warning = detectWeakAgentContent(agentText);
      if (warning) {
        warnings.push({
          path: relativePaths.agentFile,
          message: warning,
          severity: "warning",
        });
      }
    }
  }

  for (const directoryRole of REQUIRED_PROJECT_DIRECTORIES) {
    const directory = relativePaths.directories[directoryRole];
    const directoryPath = projectPaths.directories[directoryRole];
    try {
      const directoryStat = await stat(directoryPath);
      if (!directoryStat.isDirectory()) {
        errors.push({
          path: directory,
          message: `Expected ${directory} to be a directory`,
          severity: "error",
        });
      }
    } catch {
      errors.push({
        path: directory,
        message: `Missing required directory: ${directory}`,
        severity: "error",
      });
    }
  }

  if (project.config.schemaVersion !== 1) {
    errors.push({
      path: relativePaths.configFile,
      message: "Unsupported schemaVersion. Expected 1.",
      severity: "error",
    });
  }

  if (!project.config.name.trim()) {
    errors.push({
      path: relativePaths.configFile,
      message: "Project name is required.",
      severity: "error",
    });
  }

  return {
    ok: errors.length === 0,
    issues: [...errors, ...warnings],
    errors,
    warnings,
    project,
  };
}

function detectWeakAgentContent(agentText: string): string | undefined {
  const normalized = agentText.trim().toLowerCase();

  if (
    normalized.includes("follow the project instructions") ||
    normalized === "# agent" ||
    normalized.includes("placeholder agent instructions")
  ) {
    return "agent.md looks like placeholder content";
  }

  return undefined;
}
