import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CallExpression,
  type Expression,
  type ImportDeclaration,
  type ObjectExpression,
  type Program,
  parse,
} from "acorn";
import { transform } from "esbuild";
import { SPECIFIER } from "./authoring.js";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

export const ARTIFACT_TOOL_NAMES = ["list_files", "read_file", "write_file", "edit_file"] as const;

/** The built-in tool the agent calls to read a skill's full text. */
export const SKILL_TOOL_NAME = "load_skill";

type ToolNameResolution =
  | { kind: "known"; name: string }
  | { kind: "absent" }
  | { kind: "unknown" };

export async function validateToolNames(root: string): Promise<ValidationIssue[]> {
  const paths = getProjectPaths(root);
  const relativePaths = getProjectRelativePaths();
  let entries: string[];
  try {
    entries = (await readdir(paths.directories.tools, { withFileTypes: true }))
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".tool.ts"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingDirectory(error)) return [];
    throw error;
  }

  const names = new Map<string, string>();
  const issues: ValidationIssue[] = [];
  for (const entry of entries) {
    const source = `${relativePaths.directories.tools}/${entry}`;
    const text = await readFile(join(paths.directories.tools, entry), "utf8");
    const name = await readToolName(text, source);
    if (name === undefined) continue;

    if (ARTIFACT_TOOL_NAMES.includes(name as (typeof ARTIFACT_TOOL_NAMES)[number])) {
      issues.push({
        path: source,
        message: `Tool name "${name}" is reserved by Plico's artifact tools`,
        severity: "error",
      });
      continue;
    }

    if (name === SKILL_TOOL_NAME) {
      issues.push({
        path: source,
        message: `Tool name "${name}" is reserved by Plico's skill loader`,
        severity: "error",
      });
      continue;
    }

    const first = names.get(name);
    if (first) {
      issues.push({
        path: source,
        message: `Duplicate tool name "${name}" declared in ${first} and ${source}`,
        severity: "error",
      });
    } else {
      names.set(name, source);
    }
  }
  return issues;
}

interface Scope {
  declarations: Map<string, Expression>;
  /** Local names bound to `defineTool` from "@plico-ai/sdk", including `import { defineTool as x }`. */
  defineTools: Set<string>;
  /** Local names bound to the whole module, as in `import * as plico from "@plico-ai/sdk"`. */
  namespaces: Set<string>;
}

/**
 * Types are stripped first, so `as`, `satisfies` and annotations are gone before the tree is read.
 * A file that does not parse has no readable name; the project still validates and the load step
 * reports the syntax error.
 */
async function parseToolFile(text: string, fileName: string): Promise<Program | undefined> {
  try {
    const { code } = await transform(text, {
      loader: "ts",
      format: "esm",
      target: "esnext",
      sourcefile: fileName,
    });
    return parse(code, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    return undefined;
  }
}

async function readToolName(text: string, fileName: string): Promise<string | undefined> {
  const program = await parseToolFile(text, fileName);
  if (!program) return undefined;
  const scope: Scope = { declarations: new Map(), defineTools: new Set(), namespaces: new Set() };
  let defaultExpression: Expression | undefined;

  for (const statement of program.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === "Identifier" && declaration.init) {
          scope.declarations.set(declaration.id.name, declaration.init);
        }
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      const { declaration } = statement;
      if (declaration.type !== "FunctionDeclaration" && declaration.type !== "ClassDeclaration") {
        defaultExpression = declaration;
      }
    } else if (statement.type === "ExportNamedDeclaration") {
      // esbuild may write `export default tool` as `export { tool as default }`.
      for (const specifier of statement.specifiers) {
        if (moduleName(specifier.exported) === "default") defaultExpression = specifier.local;
      }
    } else if (statement.type === "ImportDeclaration") {
      readAuthoringImport(statement, scope);
    }
  }

  const object = resolveObject(defaultExpression, scope);
  if (!object) return undefined;
  const result = resolveObjectName(object, scope);
  return result.kind === "known" ? result.name : undefined;
}

function moduleName(node: { type: string; name?: string; value?: unknown }): string | undefined {
  if (node.type === "Identifier") return node.name;
  return typeof node.value === "string" ? node.value : undefined;
}

function readAuthoringImport(statement: ImportDeclaration, scope: Scope): void {
  if (statement.source.value !== SPECIFIER) return;
  for (const specifier of statement.specifiers) {
    if (specifier.type === "ImportNamespaceSpecifier") {
      scope.namespaces.add(specifier.local.name);
    } else if (
      specifier.type === "ImportSpecifier" &&
      moduleName(specifier.imported) === "defineTool"
    ) {
      scope.defineTools.add(specifier.local.name);
    }
  }
}

function resolveObjectName(object: ObjectExpression, scope: Scope): ToolNameResolution {
  for (const property of [...object.properties].reverse()) {
    if (property.type === "Property" && property.kind === "init" && !property.method) {
      const propertyName = property.computed ? undefined : moduleName(property.key);
      if (propertyName === "name") {
        const name = resolveString(property.value as Expression, scope);
        return name === undefined ? { kind: "unknown" } : { kind: "known", name };
      }
    }
    if (property.type === "SpreadElement") {
      const spreadObject = resolveObject(property.argument, scope);
      if (!spreadObject) return { kind: "unknown" };
      const spreadName = resolveObjectName(spreadObject, scope);
      if (spreadName.kind !== "absent") return spreadName;
    }
  }
  return { kind: "absent" };
}

function resolveString(expression: Expression, scope: Scope): string | undefined {
  let current = unwrap(expression, scope);
  const visited = new Set<string>();
  while (current.type === "Identifier") {
    if (visited.has(current.name)) return undefined;
    visited.add(current.name);
    const declaration = scope.declarations.get(current.name);
    if (!declaration) return undefined;
    current = unwrap(declaration, scope);
  }
  return current.type === "Literal" && typeof current.value === "string"
    ? current.value
    : undefined;
}

function resolveObject(
  expression: Expression | undefined,
  scope: Scope,
): ObjectExpression | undefined {
  let current = expression;
  const visited = new Set<string>();
  while (current) {
    current = unwrap(current, scope);
    if (current.type === "ObjectExpression") return current;
    if (current.type !== "Identifier") return undefined;
    if (visited.has(current.name)) return undefined;
    visited.add(current.name);
    current = scope.declarations.get(current.name);
  }
  return undefined;
}

function unwrap(expression: Expression, scope: Scope): Expression {
  let current = expression;
  while (isDefineToolCall(current, scope)) current = current.arguments[0] as Expression;
  return current;
}

/**
 * `defineTool(tool)` returns `tool` unchanged, so its name is the argument's name. Only the
 * `defineTool` imported from "@plico-ai/sdk" counts, under any local name or through a namespace import.
 */
function isDefineToolCall(expression: Expression, scope: Scope): expression is CallExpression {
  if (expression.type !== "CallExpression" || expression.arguments.length !== 1) return false;
  if (expression.arguments[0]?.type === "SpreadElement") return false;
  const { callee } = expression;
  if (callee.type === "Identifier") return scope.defineTools.has(callee.name);
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    scope.namespaces.has(callee.object.name) &&
    callee.property.type === "Identifier" &&
    callee.property.name === "defineTool"
  );
}

function isMissingDirectory(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
