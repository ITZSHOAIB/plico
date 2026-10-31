import { loadProject } from "@plico/core";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkServerConfig(projectRoot: string): Promise<ReadinessDiagnostic[]> {
  try {
    await loadProject(projectRoot);
    return [makeDiagnostic("ok", "server.config", "Project config loads successfully for server")];
  } catch {
    return [
      makeDiagnostic(
        "warning",
        "server.config",
        "plico.config.ts could not be loaded. Server may not start.",
      ),
    ];
  }
}
