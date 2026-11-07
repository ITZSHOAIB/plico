import type { ProjectConfig } from "@plico/contracts";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export function checkArtifactAccess(config: ProjectConfig): ReadinessDiagnostic {
  const access = config.artifacts?.access ?? "read-write";
  return makeDiagnostic(
    "ok",
    "artifacts.access",
    `Model-facing artifact tools access is "${access}".`,
    "plico.config.ts",
  );
}
