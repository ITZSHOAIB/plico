import type { ProjectConfig } from "@plico-ai/contracts";
import type { DeclaredTool } from "../types/tools.js";

export type ApprovalDecision = "none" | "required";

export function decideApproval(
  tool: Pick<DeclaredTool, "name" | "approval" | "mcp">,
  config: ProjectConfig,
): { required: boolean; reason?: string } {
  const policy = config.approvals;
  const override = policy?.tools?.[tool.name];
  let decision: ApprovalDecision;
  if (override === "required" || override === "none") {
    decision = override;
  } else if (tool.approval.required) {
    decision = "required";
  } else if (policy?.default === "required") {
    decision = "required";
  } else {
    decision = "none";
  }
  // MCP's default gate may be waived explicitly; TypeScript declarations remain mandatory.
  if (tool.approval.required && decision === "none" && !tool.mcp) {
    decision = "required";
  }
  return tool.approval.reason
    ? { required: decision === "required", reason: tool.approval.reason }
    : { required: decision === "required" };
}

export function approvalTimeoutMs(config: ProjectConfig): number {
  return config.approvals?.timeoutMs ?? 30 * 60 * 1000;
}
