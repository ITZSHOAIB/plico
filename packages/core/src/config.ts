import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { configLoadMessage, missingFileMessage, ProjectConfigError } from "./errors.js";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { LoadedProject, ProjectConfig, ValidationIssue } from "./types.js";

export async function loadProject(root: string): Promise<LoadedProject> {
  const configPath = getProjectPaths(root).configFile;
  const config = await readProjectConfig(configPath);

  return {
    root,
    configPath,
    config,
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
