import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

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
const CONFIG_FILENAME = "plico.config.ts";

export async function loadProject(root: string): Promise<LoadedProject> {
  const configPath = join(root, CONFIG_FILENAME);
  const config = await readProjectConfig(configPath);

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
    if (error instanceof ProjectConfigError) {
      issues.push(...error.issues);
    } else {
      issues.push({
        path: CONFIG_FILENAME,
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
      path: CONFIG_FILENAME,
      message: "Unsupported schemaVersion. Expected 1.",
      severity: "error",
    });
  }

  if (project && !project.config.name.trim()) {
    issues.push({
      path: CONFIG_FILENAME,
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

async function readProjectConfig(configPath: string): Promise<ProjectConfig> {
  try {
    await stat(configPath);
  } catch (error) {
    throw new ProjectConfigError(configPath, [
      {
        path: CONFIG_FILENAME,
        message: missingFileMessage(error),
        severity: "error",
      },
    ]);
  }

  let configModule: unknown;
  try {
    configModule = await tsImport(pathToFileURL(configPath).href, {
      parentURL: pathToFileURL(join(configPath, "..", "project-loader.ts")).href,
    });
  } catch (error) {
    throw new ProjectConfigError(configPath, [
      {
        path: CONFIG_FILENAME,
        message: configLoadMessage(error),
        severity: "error",
      },
    ]);
  }

  const exportedConfig = readDefaultExport(configModule, configPath);
  return normalizeProjectConfig(exportedConfig, configPath);
}

function readDefaultExport(configModule: unknown, configPath: string): unknown {
  if (!isRecord(configModule) || !Object.hasOwn(configModule, "default")) {
    throw new ProjectConfigError(configPath, [
      {
        path: CONFIG_FILENAME,
        message: `Missing default export in ${CONFIG_FILENAME}`,
        severity: "error",
      },
    ]);
  }

  if (!isRecord(configModule.default) || !Object.hasOwn(configModule.default, "default")) {
    throw new ProjectConfigError(configPath, [
      {
        path: CONFIG_FILENAME,
        message: `Missing default export in ${CONFIG_FILENAME}`,
        severity: "error",
      },
    ]);
  }

  return unwrapDefaultExport(configModule.default.default);
}

function normalizeProjectConfig(
  value: unknown,
  configPath: string,
): ProjectConfig {
  const issues = validateProjectConfigShape(value);

  if (issues.length > 0) {
    throw new ProjectConfigError(configPath, issues);
  }

  const config = value as ProjectConfig & Record<string, unknown>;

  const normalized: ProjectConfig = {
    schemaVersion: config.schemaVersion,
    name: config.name,
  };

  if (typeof config.description === "string") {
    normalized.description = config.description;
  }

  if (typeof config.template === "string") {
    normalized.template = config.template;
  }

  return normalized;
}

function validateProjectConfigShape(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value) || Array.isArray(value)) {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Expected default export to be an object",
      severity: "error",
    });
    return issues;
  }

  if (!Object.hasOwn(value, "schemaVersion")) {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Missing required field: schemaVersion",
      severity: "error",
    });
  } else if (!Number.isInteger(value.schemaVersion)) {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Expected schemaVersion to be an integer",
      severity: "error",
    });
  }

  if (!Object.hasOwn(value, "name")) {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Missing required field: name",
      severity: "error",
    });
  } else if (typeof value.name !== "string") {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Expected name to be a string",
      severity: "error",
    });
  }

  if (Object.hasOwn(value, "description") && typeof value.description !== "string") {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Expected description to be a string",
      severity: "error",
    });
  }

  if (Object.hasOwn(value, "template") && typeof value.template !== "string") {
    issues.push({
      path: CONFIG_FILENAME,
      message: "Expected template to be a string",
      severity: "error",
    });
  }

  return issues;
}

class ProjectConfigError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly issues: ValidationIssue[],
  ) {
    super(`Invalid config at ${configPath}`);
  }
}

function missingFileMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("ENOENT")) {
    return `Missing required file: ${CONFIG_FILENAME}`;
  }

  return `Unable to read ${CONFIG_FILENAME}`;
}

function configLoadMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `Failed to execute ${CONFIG_FILENAME}: ${error.message}`;
  }

  return `Failed to execute ${CONFIG_FILENAME}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapDefaultExport(value: unknown): unknown {
  let current = value;

  while (isRecord(current) && Object.hasOwn(current, "default")) {
    const keys = Object.keys(current);
    const looksLikeLoaderWrapper =
      keys.length === 1 || (keys.length === 2 && keys.includes("module.exports"));

    if (!looksLikeLoaderWrapper) {
      break;
    }

    current = current.default;
  }

  return current;
}
