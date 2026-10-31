import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import { discoverToolFiles, loadToolFile } from "../../tools/index.js";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { diag } from "../diagnostic.js";

export async function checkTools(project: LoadedProject): Promise<ReadinessDiagnostic[]> {
  const diagnostics: ReadinessDiagnostic[] = [];
  const projectPaths = getProjectPaths(project.root);
  const relativePaths = getProjectRelativePaths();
  const toolFiles = await discoverToolFiles(project);

  if (toolFiles.length === 0) {
    diagnostics.push(
      diag(
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
        diag(
          "error",
          "tools.discovery",
          `Schema validation failed for ${entry}: ${String(error)}`,
          source,
        ),
      );
    }
  }
  diagnostics.push(
    diag(
      validCount === toolFiles.length ? "ok" : "warning",
      "tools.discovery",
      `${validCount}/${toolFiles.length} tool(s) valid`,
    ),
  );
  return diagnostics;
}
