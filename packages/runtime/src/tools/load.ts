import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isRecord } from "../guards.js";
import type { DeclaredTool } from "../types/index.js";
import { normalizeDeclaredTool } from "./normalize.js";

export async function loadToolFile(toolPath: string, source: string): Promise<DeclaredTool> {
  const module = await importTranspiledTool(toolPath);
  const exportedTool = readDefaultExport(module, source);
  return normalizeDeclaredTool(exportedTool, source);
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
