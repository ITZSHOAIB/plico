import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { evalFileRole, getProjectRelativePaths, parseEvalCase } from "@plico-ai/core";
import type { DryRunScriptStep, EvalCase } from "../types/index.js";

const fixtureSuffix = ".script.json";

function toEvalCase(file: string, parsed: unknown): EvalCase {
  const fixture = (Array.isArray(parsed) ? { script: parsed } : parsed) as Record<string, unknown>;
  if (!Array.isArray(fixture?.script)) {
    throw new Error(`Invalid eval fixture ${file}: expected a step array or a "script" array.`);
  }

  const entry: EvalCase = {
    name: typeof fixture.name === "string" ? fixture.name : file.slice(0, -fixtureSuffix.length),
    script: fixture.script as DryRunScriptStep[],
  };
  if (typeof fixture.description === "string") entry.description = fixture.description;
  if (fixture.expect !== undefined)
    entry.expect = fixture.expect as NonNullable<EvalCase["expect"]>;
  return entry;
}

function markdownCase(
  file: string,
  raw: string,
  fixture: EvalCase | undefined,
): EvalCase | undefined {
  const path = `${getProjectRelativePaths().directories.evals}/${file}`;
  const parsed = parseEvalCase(path, raw);
  if (parsed.kind === "missing-frontmatter") return undefined;
  const [issue] = parsed.issues;
  if (issue) throw new Error(`Invalid eval case ${path}:${issue.line}: ${issue.message}`);

  const { definition } = parsed;
  const entry: EvalCase = {
    name: file.slice(0, -".md".length),
    expect: definition.expect,
    criteria: definition.criteria,
    scorers: definition.scorers,
  };
  if (fixture?.script) entry.script = fixture.script;
  if (definition.input !== undefined) entry.input = definition.input;
  return entry;
}

async function readEvalFiles(evalsDir: string): Promise<Array<{ file: string; raw: string }>> {
  let entries: string[];
  try {
    entries = (await readdir(evalsDir)).sort();
  } catch {
    return [];
  }

  const files = entries.filter((e) => evalFileRole(e) === "case" || evalFileRole(e) === "fixture");
  if (entries.some((e) => evalFileRole(e) === "scorers")) {
    const scorers = await readdir(join(evalsDir, "scorers")).catch(() => []);
    files.push(
      ...scorers
        .filter((s) => s.endsWith(".ts"))
        .sort()
        .map((s) => `scorers/${s}`),
    );
  }
  return Promise.all(
    files.map(async (file) => ({ file, raw: await readFile(join(evalsDir, file), "utf8") })),
  );
}

function parseFixture(file: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid eval fixture ${file}: ${(error as Error).message}`);
  }
}

/**
 * Reads the cases in `evals/`. A `<name>.md` case replays `<name>.script.json` when there is one;
 * a fixture without a Markdown case is a case of its own.
 */
export async function discoverEvalCases(evalsDir: string): Promise<EvalCase[]> {
  const files = await readEvalFiles(evalsDir);
  const fixtures = new Map(
    files
      .filter(({ file }) => evalFileRole(file) === "fixture")
      .map(({ file, raw }) => [file, toEvalCase(file, parseFixture(file, raw))] as const),
  );

  const cases: EvalCase[] = [];
  const paired = new Set<string>();
  // Files are sorted, so `<name>.md` comes before the `<name>.script.json` it pairs with.
  for (const { file, raw } of files) {
    const fixture = fixtures.get(file);
    if (fixture) {
      if (!paired.has(file)) cases.push(fixture);
      continue;
    }
    if (evalFileRole(file) !== "case") continue;
    const fixtureFile = file.replace(/\.md$/, fixtureSuffix);
    const entry = markdownCase(file, raw, fixtures.get(fixtureFile));
    if (!entry) continue;
    cases.push(entry);
    paired.add(fixtureFile);
  }
  return cases;
}

/** Identifies the cases, fixtures and scorers in `evals/`, so stale reports can be detected. */
export async function digestEvalFixtures(evalsDir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const { file, raw } of await readEvalFiles(evalsDir)) {
    hash.update(`${file}\0${raw}\0`);
  }

  return hash.digest("hex");
}
