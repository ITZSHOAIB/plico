import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import { discoverToolFiles, loadToolFile } from "../../tools/index.js";
import type { DeclaredTool, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";
import { checkApprovalPolicy } from "./approval-policy.js";

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
      ...checkApprovalPolicy(project, [], { toolsComplete: false }),
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
    diagnostics.push(...checkApprovalPolicy(project, []));
    return diagnostics;
  }

  let validCount = 0;
  const tools: DeclaredTool[] = [];
  for (const entry of toolFiles) {
    const source = `${relativePaths.directories.tools}/${entry}`;
    try {
      tools.push(await loadToolFile(join(projectPaths.directories.tools, entry), source));
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
  diagnostics.push(
    ...checkApprovalPolicy(project, tools, { toolsComplete: validCount === toolFiles.length }),
  );
  return diagnostics;
}
