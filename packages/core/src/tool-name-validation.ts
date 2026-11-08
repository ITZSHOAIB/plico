import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

const require = createRequire(import.meta.url);

export const ARTIFACT_TOOL_NAMES = ["list_files", "read_file", "write_file", "edit_file"] as const;

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
    const name = readToolName(text, source);
    if (name === undefined) continue;

    if (ARTIFACT_TOOL_NAMES.includes(name as (typeof ARTIFACT_TOOL_NAMES)[number])) {
      issues.push({
        path: source,
        message: `Tool name "${name}" is reserved by Plico's artifact tools`,
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
  declarations: Map<string, import("typescript").Expression>;
  /** Local names bound to `defineTool` from "plico", including `import { defineTool as x }`. */
  defineTools: Set<string>;
  /** Local names bound to the whole module, as in `import * as plico from "plico"`. */
  namespaces: Set<string>;
}

function readToolName(text: string, fileName: string): string | undefined {
  const ts = require("typescript") as typeof import("typescript");
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const scope: Scope = { declarations: new Map(), defineTools: new Set(), namespaces: new Set() };
  let defaultExpression: import("typescript").Expression | undefined;

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          scope.declarations.set(declaration.name.text, declaration.initializer);
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      defaultExpression = statement.expression;
    } else if (ts.isImportDeclaration(statement)) {
      readAuthoringImport(statement, scope);
    }
  }

  const object = resolveObject(defaultExpression, scope);
  if (!object) return undefined;
  const result = resolveObjectName(object, scope);
  return result.kind === "known" ? result.name : undefined;
}

function readAuthoringImport(
  statement: import("typescript").ImportDeclaration,
  scope: Scope,
): void {
  const ts = require("typescript") as typeof import("typescript");
  const bindings = statement.importClause?.namedBindings;
  if (!bindings || !ts.isStringLiteral(statement.moduleSpecifier)) return;
  if (statement.moduleSpecifier.text !== "plico") return;
  if (ts.isNamespaceImport(bindings)) {
    scope.namespaces.add(bindings.name.text);
    return;
  }
  for (const element of bindings.elements) {
    if ((element.propertyName ?? element.name).text === "defineTool") {
      scope.defineTools.add(element.name.text);
    }
  }
}

function resolveObjectName(
  object: import("typescript").ObjectLiteralExpression,
  scope: Scope,
): ToolNameResolution {
  const ts = require("typescript") as typeof import("typescript");
  for (const property of [...object.properties].reverse()) {
    if (ts.isPropertyAssignment(property)) {
      const propertyName =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
      if (propertyName === "name") {
        const name = resolveString(property.initializer, scope);
        return name === undefined ? { kind: "unknown" } : { kind: "known", name };
      }
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === "name") {
      const name = resolveString(property.name, scope);
      return name === undefined ? { kind: "unknown" } : { kind: "known", name };
    }
    if (ts.isSpreadAssignment(property)) {
      const spreadObject = resolveObject(property.expression, scope);
      if (!spreadObject) return { kind: "unknown" };
      const spreadName = resolveObjectName(spreadObject, scope);
      if (spreadName.kind !== "absent") return spreadName;
    }
  }
  return { kind: "absent" };
}

function resolveString(
  expression: import("typescript").Expression,
  scope: Scope,
): string | undefined {
  const ts = require("typescript") as typeof import("typescript");
  let current = unwrap(expression, scope);
  const visited = new Set<string>();
  while (ts.isIdentifier(current)) {
    if (visited.has(current.text)) return undefined;
    visited.add(current.text);
    const declaration = scope.declarations.get(current.text);
    if (!declaration) return undefined;
    current = unwrap(declaration, scope);
  }
  return ts.isStringLiteral(current) ? current.text : undefined;
}

function resolveObject(
  expression: import("typescript").Expression | undefined,
  scope: Scope,
): import("typescript").ObjectLiteralExpression | undefined {
  const ts = require("typescript") as typeof import("typescript");
  let current = expression;
  const visited = new Set<string>();
  while (current) {
    current = unwrap(current, scope);
    if (ts.isObjectLiteralExpression(current)) return current;
    if (!ts.isIdentifier(current)) return undefined;
    if (visited.has(current.text)) return undefined;
    visited.add(current.text);
    current = scope.declarations.get(current.text);
  }
  return undefined;
}

function unwrap(
  expression: import("typescript").Expression,
  scope: Scope,
): import("typescript").Expression {
  const ts = require("typescript") as typeof import("typescript");
  let current = expression;
  while (true) {
    if (
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.expression;
    } else if (isDefineToolCall(current, scope)) {
      current = current.arguments[0] as import("typescript").Expression;
    } else {
      return current;
    }
  }
}

/**
 * `defineTool(tool)` returns `tool` unchanged, so its name is the argument's name. Only the
 * `defineTool` imported from "plico" counts, under any local name or through a namespace import.
 */
function isDefineToolCall(
  expression: import("typescript").Expression,
  scope: Scope,
): expression is import("typescript").CallExpression {
  const ts = require("typescript") as typeof import("typescript");
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return false;
  const callee = expression.expression;
  if (ts.isIdentifier(callee)) return scope.defineTools.has(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    scope.namespaces.has(callee.expression.text) &&
    callee.name.text === "defineTool"
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
