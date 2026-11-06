import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, parse, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { register as registerCjs, require as tsxRequire } from "tsx/cjs/api";
import { register as registerEsm } from "tsx/esm/api";
import { isRecord } from "../guards.js";
import type { DeclaredTool } from "../types/index.js";
import { normalizeDeclaredTool } from "./normalize.js";

let cjsRegistered = false;
let esmRegistered = false;
let loadSequence = 0;

export async function loadToolFile(toolPath: string, source: string): Promise<DeclaredTool> {
  const module = (await hasModulePackageScope(toolPath))
    ? await importToolModule(toolPath)
    : importCommonJsTool(toolPath);
  const exportedTool = readDefaultExport(module, source);
  return normalizeDeclaredTool(exportedTool, source, toolPath);
}

async function importToolModule(toolPath: string): Promise<unknown> {
  if (!esmRegistered) {
    registerEsm();
    esmRegistered = true;
  }
  const url = new URL(pathToFileURL(toolPath).href);
  url.searchParams.set("plicoLoad", String(++loadSequence));
  return import(url.href);
}

function importCommonJsTool(toolPath: string): unknown {
  if (!cjsRegistered) {
    registerCjs();
    cjsRegistered = true;
  }
  const require = createRequire(import.meta.url);
  clearProjectToolCache(toolPath);
  return tsxRequire(require.resolve(toolPath), import.meta.url);
}

function clearProjectToolCache(toolPath: string): void {
  const toolsDirectory = findToolsDirectory(dirname(toolPath));
  for (const cachedPath of Object.keys(tsxRequire.cache)) {
    const sourcePath = cachedPath.split("?", 1)[0];
    if (!sourcePath) continue;
    if (extname(sourcePath) !== ".ts") continue;
    const pathFromTools = relative(toolsDirectory, sourcePath);
    if (pathFromTools === "" || (!pathFromTools.startsWith("..") && !isAbsolute(pathFromTools))) {
      delete tsxRequire.cache[cachedPath];
    }
  }
}

function findToolsDirectory(directory: string): string {
  if (directory === parse(directory).root) return directory;
  if (directory.split(/[\\/]/).at(-1) === "tools") return directory;
  return findToolsDirectory(dirname(directory));
}

async function hasModulePackageScope(filePath: string): Promise<boolean> {
  let directory = dirname(filePath);
  const filesystemRoot = parse(directory).root;
  while (true) {
    try {
      const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
        type?: string;
      };
      return packageJson.type === "module";
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    if (directory === filesystemRoot) return false;
    directory = dirname(directory);
  }
}

function readDefaultExport(toolModule: unknown, source: string): unknown {
  if (!isRecord(toolModule) || !Object.hasOwn(toolModule, "default")) {
    throw new Error(`${source} must default export a declared tool`);
  }

  return toolModule.default;
}
