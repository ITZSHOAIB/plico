import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProject } from "./config.js";
import { parseEvalCase } from "./eval-case.js";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import { readRunSchemas } from "./run-schemas.js";
import type { ValidationIssue } from "./types.js";

const FIXTURE_SUFFIX = ".script.json";
const SCORERS_DIRECTORY = "scorers";

/** How a file in `evals/` is used by `plico eval`, or undefined when it is ignored on purpose. */
export function evalFileRole(name: string): "case" | "fixture" | "scorers" | undefined {
  if (name.startsWith(".") || name.toLowerCase() === "readme.md") return undefined;
  if (name === SCORERS_DIRECTORY) return "scorers";
  if (name.endsWith(FIXTURE_SUFFIX)) return "fixture";
  if (name.endsWith(".md")) return "case";
  return undefined;
}

/** Checks `evals/`: Markdown cases with line numbers, scorer references, and files eval skips. */
export async function validateEvalFiles(
  root: string,
): Promise<{ errors: ValidationIssue[]; warnings: ValidationIssue[] }> {
  const directory = getProjectRelativePaths().directories.evals;
  const evalsPath = getProjectPaths(root).directories.evals;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  let names: string[];
  try {
    names = (await readdir(evalsPath)).sort();
  } catch {
    return { errors, warnings };
  }
  const scorers = names.includes(SCORERS_DIRECTORY)
    ? await readdir(join(evalsPath, SCORERS_DIRECTORY)).catch(() => [])
    : [];

  for (const name of names) {
    const path = `${directory}/${name}`;
    const role = evalFileRole(name);
    if (role === undefined && !name.startsWith(".") && name.toLowerCase() !== "readme.md")
      warnings.push({
        path,
        message: `Not run by plico eval. An eval case is <name>.md, with an optional <name>${FIXTURE_SUFFIX} fixture.`,
        severity: "warning",
      });
    if (role !== "case") continue;

    const parsed = parseEvalCase(path, await readFile(join(evalsPath, name), "utf8"));
    if (parsed.kind === "missing-frontmatter") {
      warnings.push({
        path,
        message: "Not run by plico eval: an eval case starts with a --- frontmatter block.",
        severity: "warning",
      });
      continue;
    }
    errors.push(...parsed.issues);
    parsed.definition.scorers.forEach(({ use }, index) => {
      if (!scorers.includes(`${use}.ts`))
        errors.push({
          path,
          line: parsed.lineAt(["scorers", index]),
          message: `Scorer "${use}" not found. Add ${directory}/${SCORERS_DIRECTORY}/${use}.ts.`,
          severity: "error",
        });
    });
    const input = parsed.definition.input;
    const schema = input === undefined ? undefined : await readInputSchema(root);
    const checked = schema ? await schema.parse(input) : { success: true as const };
    if (!checked.success)
      errors.push({
        path,
        line: parsed.lineAt(["input"]),
        message: `input does not match the agent's input schema: ${checked.error}`,
        severity: "error",
      });
    const fixture = `${name.slice(0, -".md".length)}${FIXTURE_SUFFIX}`;
    if (parsed.issues.length === 0 && !names.includes(fixture))
      warnings.push({
        path,
        message: `No ${fixture} fixture, so plico eval skips this case unless it runs with --live.`,
        severity: "warning",
      });
  }
  return { errors, warnings };
}

/** The agent's input schema, or undefined when it has none or the project cannot load. */
async function readInputSchema(root: string) {
  try {
    return (await readRunSchemas(await loadProject(root))).input;
  } catch {
    return undefined;
  }
}
