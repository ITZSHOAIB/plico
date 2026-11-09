import { readFile } from "node:fs/promises";
import { type DryRunScriptStep, normalizeScript } from "@plico-ai/runtime";
import { errorMessage } from "./errors.js";

export async function loadDryRunScript(scriptPath: string): Promise<DryRunScriptStep[]> {
  try {
    const raw = await readFile(scriptPath, "utf8");
    const parsed = JSON.parse(raw);

    return normalizeScript(parsed);
  } catch (error) {
    throw new Error(`Unable to parse dry run script ${scriptPath}: ${errorMessage(error)}`);
  }
}
