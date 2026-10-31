import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalCase } from "../types/index.js";

export async function discoverEvalCases(evalsDir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(evalsDir);
  } catch {
    return [];
  }

  const scriptFiles = entries.filter((e) => e.endsWith(".script.json")).sort();
  const cases: EvalCase[] = [];

  for (const file of scriptFiles) {
    const raw = await readFile(join(evalsDir, file), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entry: Record<string, unknown> = {
      name: parsed.name,
      script: parsed.script,
    };
    if (typeof parsed.description === "string") entry.description = parsed.description;
    if (parsed.expect !== undefined) entry.expect = parsed.expect;
    cases.push(entry as unknown as EvalCase);
  }

  return cases;
}
