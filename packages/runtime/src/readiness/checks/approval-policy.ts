import type { LoadedProject } from "@plico/core";
import type { DeclaredTool, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export function checkApprovalPolicy(
  project: LoadedProject,
  tools: DeclaredTool[],
  options: { toolsComplete?: boolean } = {},
): ReadinessDiagnostic[] {
  const toolsComplete = options.toolsComplete ?? true;
  const names = new Set(tools.map((tool) => tool.name));
  const diagnostics = toolsComplete
    ? Object.keys(project.config.approvals?.tools ?? {})
        .filter((name) => !names.has(name))
        .map((name) =>
          makeDiagnostic(
            "warning",
            "approvals.policy",
            `Approval policy refers to undeclared tool "${name}".`,
            "plico.config.ts",
          ),
        )
    : [];

  for (const tool of tools) {
    if (tool.approval.required && project.config.approvals?.tools?.[tool.name] === "none") {
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "approvals.policy",
          `Tool "${tool.name}" requires approval in its declaration; the "none" override has no effect.`,
        ),
      );
    }
  }

  if (diagnostics.length === 0 && toolsComplete) {
    diagnostics.push(
      makeDiagnostic(
        "ok",
        "approvals.policy",
        `Approval policy checked against ${tools.length} declared tool(s).`,
      ),
    );
  }
  return diagnostics;
}
