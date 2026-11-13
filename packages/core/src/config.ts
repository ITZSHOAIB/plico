import { readFile, stat } from "node:fs/promises";
import { transform } from "esbuild";
import { rewriteAuthoringImports } from "./authoring.js";
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
  const transpiled = await transform(source, {
    loader: "ts",
    format: "esm",
    target: "es2022",
    sourcefile: configPath,
  });

  const code = rewriteAuthoringImports(transpiled.code, configPath);
  const encoded = Buffer.from(code, "utf8").toString("base64");
  const moduleUrl = `data:text/javascript;base64,${encoded}`;
  return import(moduleUrl);
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
    artifacts: { access: config.artifacts?.access ?? "read-write" },
  };

  if (typeof config.description === "string") {
    normalized.description = config.description;
  }

  if (typeof config.template === "string") {
    normalized.template = config.template;
  }

  if (config.model !== undefined) {
    normalized.model = { provider: config.model.provider, name: config.model.name };
    if (config.model.baseURL !== undefined) normalized.model.baseURL = config.model.baseURL;
    if (config.model.apiKeyEnv !== undefined) normalized.model.apiKeyEnv = config.model.apiKeyEnv;
    if (config.model.maxSteps !== undefined) normalized.model.maxSteps = config.model.maxSteps;
    if (config.model.retries !== undefined) normalized.model.retries = config.model.retries;
    if (config.model.retryDelayMs !== undefined)
      normalized.model.retryDelayMs = config.model.retryDelayMs;
  }

  if (config.input !== undefined) normalized.input = config.input;
  if (config.output !== undefined) normalized.output = config.output;

  if (config.execution !== undefined) {
    normalized.execution = {};
    if (config.execution.leaseMs !== undefined)
      normalized.execution.leaseMs = config.execution.leaseMs;
  }

  if (config.threads !== undefined) {
    normalized.threads = {};
    if (config.threads.title !== undefined) normalized.threads.title = config.threads.title;
  }

  if (config.approvals !== undefined) {
    normalized.approvals = {};
    if (config.approvals.default !== undefined)
      normalized.approvals.default = config.approvals.default;
    if (config.approvals.timeoutMs !== undefined)
      normalized.approvals.timeoutMs = config.approvals.timeoutMs;
    if (config.approvals.tools !== undefined)
      normalized.approvals.tools = { ...config.approvals.tools };
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

  if (
    Object.hasOwn(value, "artifacts") &&
    (!isRecord(value.artifacts) ||
      Array.isArray(value.artifacts) ||
      (value.artifacts.access !== "read-write" &&
        value.artifacts.access !== "read-only" &&
        value.artifacts.access !== "off"))
  ) {
    issues.push({
      path: relativePaths.configFile,
      message: 'Expected artifacts.access to be "read-write", "read-only", or "off"',
      severity: "error",
    });
  }

  if (Object.hasOwn(value, "model")) {
    const model = value.model;
    if (
      !isRecord(model) ||
      Array.isArray(model) ||
      typeof model.provider !== "string" ||
      !model.provider.trim() ||
      typeof model.name !== "string" ||
      !model.name.trim() ||
      (Object.hasOwn(model, "baseURL") &&
        (typeof model.baseURL !== "string" || !model.baseURL.trim())) ||
      (Object.hasOwn(model, "apiKeyEnv") &&
        (typeof model.apiKeyEnv !== "string" || !/^[A-Za-z_]\w*$/.test(model.apiKeyEnv))) ||
      (Object.hasOwn(model, "maxSteps") &&
        (!Number.isSafeInteger(model.maxSteps) || Number(model.maxSteps) <= 0)) ||
      (Object.hasOwn(model, "retries") &&
        (!Number.isSafeInteger(model.retries) ||
          Number(model.retries) < 0 ||
          Number(model.retries) > 10)) ||
      (Object.hasOwn(model, "retryDelayMs") &&
        (!Number.isSafeInteger(model.retryDelayMs) ||
          Number(model.retryDelayMs) < 0 ||
          Number(model.retryDelayMs) > 60000))
    ) {
      issues.push({
        path: relativePaths.configFile,
        message:
          "Expected non-empty model.provider and model.name, string model.baseURL and model.apiKeyEnv (a variable name), positive model.maxSteps, retries between 0 and 10, and retryDelayMs between 0 and 60000",
        severity: "error",
      });
    }
  }
  if (Object.hasOwn(value, "execution")) {
    const execution = value.execution;
    if (
      !isRecord(execution) ||
      Array.isArray(execution) ||
      (Object.hasOwn(execution, "leaseMs") &&
        (!Number.isSafeInteger(execution.leaseMs) || Number(execution.leaseMs) <= 0))
    ) {
      issues.push({
        path: relativePaths.configFile,
        message: "Expected execution.leaseMs to be a positive integer",
        severity: "error",
      });
    }
  }
  if (Object.hasOwn(value, "threads")) {
    const threads = value.threads;
    if (
      !isRecord(threads) ||
      Array.isArray(threads) ||
      (Object.hasOwn(threads, "title") && threads.title !== "keywords" && threads.title !== "model")
    ) {
      issues.push({
        path: relativePaths.configFile,
        message: 'Expected threads.title to be "keywords" or "model"',
        severity: "error",
      });
    }
  }
  if (Object.hasOwn(value, "approvals")) {
    const approvals = value.approvals;
    if (!isRecord(approvals) || Array.isArray(approvals)) {
      issues.push({
        path: relativePaths.configFile,
        message: "Expected approvals to be an object",
        severity: "error",
      });
    } else {
      if (
        Object.hasOwn(approvals, "default") &&
        approvals.default !== "none" &&
        approvals.default !== "required"
      ) {
        issues.push({
          path: relativePaths.configFile,
          message: 'Expected approvals.default to be "none" or "required"',
          severity: "error",
        });
      }
      if (
        Object.hasOwn(approvals, "timeoutMs") &&
        (!Number.isSafeInteger(approvals.timeoutMs) || Number(approvals.timeoutMs) <= 0)
      ) {
        issues.push({
          path: relativePaths.configFile,
          message: "Expected approvals.timeoutMs to be a positive integer",
          severity: "error",
        });
      }
      if (Object.hasOwn(approvals, "tools")) {
        const tools = approvals.tools;
        if (!isRecord(tools) || Array.isArray(tools)) {
          issues.push({
            path: relativePaths.configFile,
            message: "Expected approvals.tools to be an object",
            severity: "error",
          });
        } else {
          for (const [name, value2] of Object.entries(tools)) {
            if (value2 !== "none" && value2 !== "required") {
              issues.push({
                path: relativePaths.configFile,
                message: `Expected approvals.tools.${name} to be "none" or "required"`,
                severity: "error",
              });
            }
          }
        }
      }
    }
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
