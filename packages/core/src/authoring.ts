import Module, { createRequire, register } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Project files import `plico` for `defineConfig` and `defineTool`. Those helpers return their
 * argument unchanged, so any copy works. A project installed next to a global `plico` has no
 * node_modules of its own; resolution falls back to the copy that ships with this install.
 */
const SPECIFIER = "plico";

function ownEntry(): string {
  return createRequire(import.meta.url).resolve(SPECIFIER);
}

/** The file URL the `plico` specifier should resolve to for a file in `fromFile`'s project. */
export function resolveAuthoringModule(fromFile: string): string {
  try {
    return pathToFileURL(createRequire(fromFile).resolve(SPECIFIER)).href;
  } catch {
    return pathToFileURL(ownEntry()).href;
  }
}

/** Point `import "plico"` in a transpiled project file at an absolute file URL. */
export function rewriteAuthoringImports(code: string, fromFile: string): string {
  return code.replace(
    /(\bfrom\s*|\bimport\s*)(["'])plico\2/g,
    (_match, keyword: string) => `${keyword}${JSON.stringify(resolveAuthoringModule(fromFile))}`,
  );
}

const ESM_HOOKS = `
let fallback;
export function initialize(data) { fallback = data.url; }
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier === "${SPECIFIER}" && error?.code === "ERR_MODULE_NOT_FOUND") {
      return { url: fallback, shortCircuit: true };
    }
    throw error;
  }
}
`;

type ResolveFilename = (request: string, ...rest: unknown[]) => string;

let installed = false;

/** Make `import "plico"` and `require("plico")` fall back to this install when a tool file cannot resolve it. */
export function installAuthoringFallback(): void {
  if (installed) return;
  installed = true;
  const entry = ownEntry();
  register(`data:text/javascript,${encodeURIComponent(ESM_HOOKS)}`, {
    parentURL: pathToFileURL(`${dirname(entry)}/`).href,
    data: { url: pathToFileURL(entry).href },
  });

  const internals = Module as unknown as { _resolveFilename: ResolveFilename };
  const original = internals._resolveFilename;
  internals._resolveFilename = function resolveWithFallback(request, ...rest) {
    try {
      return original.call(this, request, ...rest);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (request === SPECIFIER && code === "MODULE_NOT_FOUND") return entry;
      throw error;
    }
  };
}
