import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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

export async function discoverEvalCases(evalsDir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(evalsDir);
  } catch {
    return [];
  }

  const scriptFiles = entries.filter((e) => e.endsWith(fixtureSuffix)).sort();
  const cases: EvalCase[] = [];

  for (const file of scriptFiles) {
    const raw = await readFile(join(evalsDir, file), "utf8");
    cases.push(toEvalCase(file, JSON.parse(raw)));
  }

  return cases;
}
