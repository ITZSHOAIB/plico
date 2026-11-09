import { join } from "node:path";
import type { ReadinessDiagnostic } from "@plico/contracts";
import { loadedEnvFiles } from "../../env.js";
import { makeDiagnostic } from "../diagnostic.js";

/** Says which `.env` file was loaded. It never reads or prints the values. */
export function checkEnv(projectRoot: string): ReadinessDiagnostic[] {
  const file = join(projectRoot, ".env");
  if (!loadedEnvFiles().includes(file)) return [];
  return [makeDiagnostic("ok", "env.loaded", "Environment variables loaded from .env.", ".env")];
}
