import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

const require = createRequire(import.meta.url);

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

function readToolName(text: string, fileName: string): string | undefined {
  const ts = require("typescript") as typeof import("typescript");
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const declarations = new Map<string, import("typescript").Expression>();
  let defaultExpression: import("typescript").Expression | undefined;

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          declarations.set(declaration.name.text, declaration.initializer);
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      defaultExpression = statement.expression;
    }
  }

  const object = resolveObject(defaultExpression, declarations);
  if (!object) return undefined;
  const result = resolveObjectName(object, declarations);
  return result.kind === "known" ? result.name : undefined;
}

function resolveObjectName(
  object: import("typescript").ObjectLiteralExpression,
  declarations: Map<string, import("typescript").Expression>,
): ToolNameResolution {
  const ts = require("typescript") as typeof import("typescript");
  for (const property of [...object.properties].reverse()) {
    if (ts.isPropertyAssignment(property)) {
      const propertyName =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
      if (propertyName === "name") {
        const name = resolveString(property.initializer, declarations);
        return name === undefined ? { kind: "unknown" } : { kind: "known", name };
      }
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === "name") {
      const name = resolveString(property.name, declarations);
      return name === undefined ? { kind: "unknown" } : { kind: "known", name };
    }
    if (ts.isSpreadAssignment(property)) {
      const spreadObject = resolveObject(property.expression, declarations);
      if (!spreadObject) return { kind: "unknown" };
      const spreadName = resolveObjectName(spreadObject, declarations);
      if (spreadName.kind !== "absent") return spreadName;
    }
  }
  return { kind: "absent" };
}

function resolveString(
  expression: import("typescript").Expression,
  declarations: Map<string, import("typescript").Expression>,
): string | undefined {
  const ts = require("typescript") as typeof import("typescript");
  let current = unwrap(expression);
  const visited = new Set<string>();
  while (ts.isIdentifier(current)) {
    if (visited.has(current.text)) return undefined;
    visited.add(current.text);
    const declaration = declarations.get(current.text);
    if (!declaration) return undefined;
    current = unwrap(declaration);
  }
  return ts.isStringLiteral(current) ? current.text : undefined;
}

function resolveObject(
  expression: import("typescript").Expression | undefined,
  declarations: Map<string, import("typescript").Expression>,
): import("typescript").ObjectLiteralExpression | undefined {
  const ts = require("typescript") as typeof import("typescript");
  let current = expression;
  const visited = new Set<string>();
  while (current) {
    current = unwrap(current);
    if (ts.isObjectLiteralExpression(current)) return current;
    if (!ts.isIdentifier(current)) return undefined;
    if (visited.has(current.text)) return undefined;
    visited.add(current.text);
    current = declarations.get(current.text);
  }
  return undefined;
}

function unwrap(expression: import("typescript").Expression): import("typescript").Expression {
  const ts = require("typescript") as typeof import("typescript");
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isMissingDirectory(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
