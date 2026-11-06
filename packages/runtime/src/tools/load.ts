import { pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";
import { isRecord } from "../guards.js";
import type { DeclaredTool } from "../types/index.js";
import { normalizeDeclaredTool } from "./normalize.js";

register();

export async function loadToolFile(toolPath: string, source: string): Promise<DeclaredTool> {
  const module = await importTranspiledTool(toolPath);
  const exportedTool = readDefaultExport(module, source);
  return normalizeDeclaredTool(exportedTool, source);
}

async function importTranspiledTool(toolPath: string): Promise<unknown> {
  return import(pathToFileURL(toolPath).href);
}

function readDefaultExport(toolModule: unknown, source: string): unknown {
  if (!isRecord(toolModule) || !Object.hasOwn(toolModule, "default")) {
    throw new Error(`${source} must default export a declared tool`);
  }

  return toolModule.default;
}
