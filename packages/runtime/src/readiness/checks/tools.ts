import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import { discoverToolFiles, loadToolFile } from "../../tools/index.js";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkTools(project: LoadedProject): Promise<ReadinessDiagnostic[]> {
  const diagnostics: ReadinessDiagnostic[] = [];
  const projectPaths = getProjectPaths(project.root);
  const relativePaths = getProjectRelativePaths();
  let toolFiles: string[];
  try {
    toolFiles = await discoverToolFiles(project);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [
      makeDiagnostic(
        "error",
        "tools.discovery",
        "tools/ directory not found. Create tools/ to declare tools.",
        relativePaths.directories.tools,
      ),
    ];
  }

  if (toolFiles.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "tools.discovery",
        "No tools declared. Add a .tool.ts module to get started.",
      ),
    );
    return diagnostics;
  }

  let validCount = 0;
  for (const entry of toolFiles) {
    const source = `${relativePaths.directories.tools}/${entry}`;
    try {
      await loadToolFile(join(projectPaths.directories.tools, entry), source);
      validCount++;
    } catch (error) {
      diagnostics.push(
        makeDiagnostic(
          "error",
          "tools.discovery",
          `Schema validation failed for ${entry}: ${String(error)}`,
          source,
        ),
      );
    }
  }
  diagnostics.push(
    makeDiagnostic(
      validCount === toolFiles.length ? "ok" : "warning",
      "tools.discovery",
      `${validCount}/${toolFiles.length} tool(s) valid`,
    ),
  );
  return diagnostics;
}
