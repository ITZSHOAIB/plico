import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ProjectConfig {
  schemaVersion: number;
  name: string;
  description?: string;
  template?: string;
}

export interface LoadedProject {
  root: string;
  configPath: string;
  config: ProjectConfig;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  project?: LoadedProject;
}

const REQUIRED_DIRECTORIES = ["skills", "tools", "evals", "artifacts", "memory"];

export async function loadProject(root: string): Promise<LoadedProject> {
  const configPath = join(root, "plico.config.ts");
  const configText = await readFile(configPath, "utf8");
  const config = parseConfig(configText, configPath);

  return {
    root,
    configPath,
    config,
  };
}

export async function validateProject(root: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  let project: LoadedProject | undefined;
  try {
    project = await loadProject(root);
  } catch (error) {
    if (error instanceof ConfigParseError) {
      issues.push(...error.issues);
    } else {
      issues.push({
        path: "plico.config.ts",
        message: missingFileMessage(error),
        severity: "error",
      });
    }
    return { ok: false, issues };
  }

  const agentPath = join(root, "agent.md");
  try {
    await readFile(agentPath, "utf8");
  } catch {
    issues.push({
      path: "agent.md",
      message: "Missing required file: agent.md",
      severity: "error",
    });
  }

  for (const directory of REQUIRED_DIRECTORIES) {
    const directoryPath = join(root, directory);
    try {
      const directoryStat = await stat(directoryPath);
      if (!directoryStat.isDirectory()) {
        issues.push({
          path: directory,
          message: `Expected ${directory} to be a directory`,
          severity: "error",
        });
      }
    } catch {
      issues.push({
        path: directory,
        message: `Missing required directory: ${directory}`,
        severity: "error",
      });
    }
  }

  if (project && project.config.schemaVersion !== 1) {
    issues.push({
      path: "plico.config.ts",
      message: "Unsupported schemaVersion. Expected 1.",
      severity: "error",
    });
  }

  if (project && !project.config.name.trim()) {
    issues.push({
      path: "plico.config.ts",
      message: "Project name is required.",
      severity: "error",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    project,
  };
}

function parseConfig(text: string, configPath: string): ProjectConfig {
  const schemaVersion = readNumberProperty(text, "schemaVersion");
  const name = readStringProperty(text, "name");
  const issues: ValidationIssue[] = [];

  if (schemaVersion === undefined) {
    issues.push({
      path: "plico.config.ts",
      message: "Missing required field: schemaVersion",
      severity: "error",
    });
  }

  if (name === undefined) {
    issues.push({
      path: "plico.config.ts",
      message: "Missing required field: name",
      severity: "error",
    });
  }

  if (issues.length > 0) {
    throw new ConfigParseError(configPath, issues);
  }

  if (schemaVersion === undefined || name === undefined) {
    throw new ConfigParseError(configPath, issues);
  }

  const config: ProjectConfig = {
    schemaVersion,
    name,
  };

  const description = readStringProperty(text, "description");
  if (description !== undefined) {
    config.description = description;
  }

  const template = readStringProperty(text, "template");
  if (template !== undefined) {
    config.template = template;
  }

  return config;
}

class ConfigParseError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly issues: ValidationIssue[],
  ) {
    super(`Invalid config at ${configPath}`);
  }
}

function readNumberProperty(text: string, property: string): number | undefined {
  const pattern = new RegExp(`${property}\\s*:\\s*(\\d+)`);
  const match = text.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function readStringProperty(text: string, property: string): string | undefined {
  const pattern = new RegExp(`${property}\\s*:\\s*["']([^"']+)["']`);
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

function missingFileMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("ENOENT")) {
    return "Missing required file: plico.config.ts";
  }

  return "Unable to read plico.config.ts";
}
