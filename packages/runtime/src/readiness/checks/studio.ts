import { access } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkStudio(studioPath: string | undefined): Promise<ReadinessDiagnostic[]> {
  if (studioPath === undefined) return [];

  try {
    await access(join(studioPath, "index.html"));
    return [makeDiagnostic("ok", "studio.assets", "Studio assets are built", studioPath)];
  } catch {
    return [
      makeDiagnostic(
        "warning",
        "studio.assets",
        "Studio assets not found. Build them with: pnpm --filter @plico/studio build",
        studioPath,
      ),
    ];
  }
}
