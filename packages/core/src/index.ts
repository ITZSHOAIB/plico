import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

export interface ProjectLayoutDirectories {
  skills: "skills";
  tools: "tools";
  evals: "evals";
  artifacts: "artifacts";
  memory: "memory";
}

export interface ProjectLayout {
  configFile: "plico.config.ts";
  agentFile: "agent.md";
  directories: ProjectLayoutDirectories;
}

export interface ProjectRelativePaths {
  configFile: string;
  agentFile: string;
  directories: Record<ProjectDirectoryRole, string>;
}

export interface ProjectPaths {
  configFile: string;
  agentFile: string;
  directories: Record<ProjectDirectoryRole, string>;
}

export type ProjectDirectoryRole = keyof ProjectLayoutDirectories;

export const PROJECT_LAYOUT: ProjectLayout = {
  configFile: "plico.config.ts",
  agentFile: "agent.md",
  directories: {
    skills: "skills",
    tools: "tools",
    evals: "evals",
    artifacts: "artifacts",
    memory: "memory",
  },
};

export const REQUIRED_PROJECT_DIRECTORIES: readonly ProjectDirectoryRole[] = [
  "skills",
  "tools",
  "evals",
  "artifacts",
  "memory",
];

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
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  project?: LoadedProject;
}

export function getProjectRelativePaths(): ProjectRelativePaths {
  return {
    configFile: PROJECT_LAYOUT.configFile,
    agentFile: PROJECT_LAYOUT.agentFile,
    directories: { ...PROJECT_LAYOUT.directories },
  };
}

export function getProjectPaths(root: string): ProjectPaths {
  const relative = getProjectRelativePaths();

  return {
    configFile: join(root, relative.configFile),
    agentFile: join(root, relative.agentFile),
    directories: {
      skills: join(root, relative.directories.skills),
      tools: join(root, relative.directories.tools),
      evals: join(root, relative.directories.evals),
      artifacts: join(root, relative.directories.artifacts),
      memory: join(root, relative.directories.memory),
    },
  };
}

export async function loadProject(root: string): Promise<LoadedProject> {
  const configPath = getProjectPaths(root).configFile;
  const config = await readProjectConfig(configPath);

  return {
    root,
    configPath,
    config,
  };
}

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

  if (project && project.config.schemaVersion !== 1) {
    errors.push({
      path: relativePaths.configFile,
      message: "Unsupported schemaVersion. Expected 1.",
      severity: "error",
    });
  }

  if (project && !project.config.name.trim()) {
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

async function readProjectConfig(configPath: string): Promise<ProjectConfig> {
  const relativePaths = getProjectRelativePaths();

  try {
    await stat(configPath);
  } catch (error) {
    throw new ProjectConfigError(configPath, [
      {
        path: relativePaths.configFile,
        message: missingFileMessage(error),
        severity: "error",
      },
    ]);
  }

  let configModule: unknown;
  try {
    configModule = await importTranspiledProjectConfig(configPath);
  } catch (error) {
    throw new ProjectConfigError(configPath, [
      {
        path: relativePaths.configFile,
        message: configLoadMessage(error),
        severity: "error",
      },
    ]);
  }

  const exportedConfig = readDefaultExport(configModule, configPath);
  return normalizeProjectConfig(exportedConfig, configPath);
}

async function importTranspiledProjectConfig(configPath: string): Promise<unknown> {
  const source = await readFile(configPath, "utf8");
  const { transpileModule, ModuleKind, ScriptTarget } = getTypeScript();
  const transpiled = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: configPath,
  });

  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  const moduleUrl = `data:text/javascript;base64,${encoded}`;
  return import(moduleUrl);
}

function getTypeScript(): typeof import("typescript") {
  return createRequire(import.meta.url)("typescript") as typeof import("typescript");
}

function readDefaultExport(configModule: unknown, configPath: string): unknown {
  const relativePaths = getProjectRelativePaths();

  if (!isRecord(configModule) || !Object.hasOwn(configModule, "default")) {
    throw new ProjectConfigError(configPath, [
      {
        path: relativePaths.configFile,
        message: `Missing default export in ${relativePaths.configFile}`,
        severity: "error",
      },
    ]);
  }

  return unwrapDefaultExport(configModule.default);
}

function normalizeProjectConfig(value: unknown, configPath: string): ProjectConfig {
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
  const relativePaths = getProjectRelativePaths();
  const issues: ValidationIssue[] = [];

  if (!isRecord(value) || Array.isArray(value)) {
    issues.push({
      path: relativePaths.configFile,
      message: "Expected default export to be an object",
      severity: "error",
    });
    return issues;
  }

  if (!Object.hasOwn(value, "schemaVersion")) {
    issues.push({
      path: relativePaths.configFile,
      message: "Missing required field: schemaVersion",
      severity: "error",
    });
  } else if (!Number.isInteger(value.schemaVersion)) {
    issues.push({
      path: relativePaths.configFile,
      message: "Expected schemaVersion to be an integer",
      severity: "error",
    });
  }

  if (!Object.hasOwn(value, "name")) {
    issues.push({
      path: relativePaths.configFile,
      message: "Missing required field: name",
      severity: "error",
    });
  } else if (typeof value.name !== "string") {
    issues.push({
      path: relativePaths.configFile,
      message: "Expected name to be a string",
      severity: "error",
    });
  }

  if (Object.hasOwn(value, "description") && typeof value.description !== "string") {
    issues.push({
      path: relativePaths.configFile,
      message: "Expected description to be a string",
      severity: "error",
    });
  }

  if (Object.hasOwn(value, "template") && typeof value.template !== "string") {
    issues.push({
      path: relativePaths.configFile,
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
  const relativePaths = getProjectRelativePaths();

  if (error instanceof Error && error.message.includes("ENOENT")) {
    return `Missing required file: ${relativePaths.configFile}`;
  }

  return `Unable to read ${relativePaths.configFile}`;
}

function missingFileMessageFor(path: string, error: unknown): string {
  if (error instanceof Error && error.message.includes("ENOENT")) {
    return `Missing required file: ${path}`;
  }

  return `Unable to read ${path}`;
}

function configLoadMessage(error: unknown): string {
  const relativePaths = getProjectRelativePaths();

  if (error instanceof Error && error.message) {
    return `Failed to execute ${relativePaths.configFile}: ${error.message}`;
  }

  return `Failed to execute ${relativePaths.configFile}`;
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
