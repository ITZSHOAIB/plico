import { createHash } from "node:crypto";
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

async function readFixtures(evalsDir: string): Promise<Array<{ file: string; raw: string }>> {
  let entries: string[];
  try {
    entries = await readdir(evalsDir);
  } catch {
    return [];
  }

  const scriptFiles = entries.filter((e) => e.endsWith(fixtureSuffix)).sort();
  return Promise.all(
    scriptFiles.map(async (file) => ({ file, raw: await readFile(join(evalsDir, file), "utf8") })),
  );
}

function parseFixture(file: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid eval fixture ${file}: ${(error as Error).message}`);
  }
}

export async function discoverEvalCases(evalsDir: string): Promise<EvalCase[]> {
  const fixtures = await readFixtures(evalsDir);
  return fixtures.map(({ file, raw }) => toEvalCase(file, parseFixture(file, raw)));
}

export async function digestEvalFixtures(evalsDir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const { file, raw } of await readFixtures(evalsDir)) {
    hash.update(`${file}\0${raw}\0`);
  }

  return hash.digest("hex");
}
