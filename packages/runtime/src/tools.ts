import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import { isJsonSchemaSubset } from "./schema.js";
import type { DeclaredTool } from "./types.js";

export async function discoverTools(project: LoadedProject): Promise<DeclaredTool[]> {
  const relativePaths = getProjectRelativePaths();
  const projectPaths = getProjectPaths(project.root);
  const entries = (await readdir(projectPaths.directories.tools))
    .filter((entry) => entry.endsWith(".tool.ts"))
    .sort((left, right) => left.localeCompare(right));

  const tools: DeclaredTool[] = [];
  for (const entry of entries) {
    const source = `${relativePaths.directories.tools}/${entry}`;
    const module = await importTranspiledTool(join(projectPaths.directories.tools, entry));
    const exportedTool = readDefaultExport(module, source);
    tools.push(normalizeDeclaredTool(exportedTool, source));
  }

  return tools;
}

async function importTranspiledTool(toolPath: string): Promise<unknown> {
  const source = await readFile(toolPath, "utf8");
  const { transpileModule, ModuleKind, ScriptTarget } = getTypeScript();
  const transpiled = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: toolPath,
  });

  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function getTypeScript(): typeof import("typescript") {
  return createRequire(import.meta.url)("typescript") as typeof import("typescript");
}

function readDefaultExport(toolModule: unknown, source: string): unknown {
  if (!isRecord(toolModule) || !Object.hasOwn(toolModule, "default")) {
    throw new Error(`${source} must default export a declared tool`);
  }

  return toolModule.default;
}

function normalizeDeclaredTool(value: unknown, source: string): DeclaredTool {
  if (!isRecord(value)) {
    throw new Error(`${source} must default export a declared tool object`);
  }

  const { name, description, inputSchema, capabilities, approval, handler } = value;
  if (typeof name !== "string") {
    throw new Error(`${source} tool name must be a string`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`${source} tool name must match /^[a-z][a-z0-9_]*$/`);
  }
  if (typeof description !== "string") {
    throw new Error(`${source} tool description must be a string`);
  }
  if (!isJsonSchemaSubset(inputSchema)) {
    throw new Error(`${source} inputSchema must be a supported JSON Schema subset`);
  }
  if (
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === "string")
  ) {
    throw new Error(`${source} capabilities must be an array of strings`);
  }
  if (!isRecord(approval) || typeof approval.required !== "boolean") {
    throw new Error(`${source} approval must declare a required boolean`);
  }
  if (!isToolHandler(handler)) {
    throw new Error(`${source} handler must be a function`);
  }

  return {
    source,
    name,
    description,
    inputSchema,
    capabilities,
    approval: {
      required: approval.required,
      ...(typeof approval.reason === "string" ? { reason: approval.reason } : {}),
    },
    handler,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolHandler(value: unknown): value is DeclaredTool["handler"] {
  return typeof value === "function";
}
