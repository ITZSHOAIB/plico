import type { ProjectConfig } from "@plico/contracts";
import type { DeclaredTool } from "../types/tools.js";

export type ApprovalDecision = "none" | "required";

export function decideApproval(
  tool: DeclaredTool,
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
  // Config can escalate but never silently drop a tool-declared requirement.
  if (tool.approval.required && decision === "none") {
    decision = "required";
  }
  return tool.approval.reason
    ? { required: decision === "required", reason: tool.approval.reason }
    : { required: decision === "required" };
}

export function approvalTimeoutMs(config: ProjectConfig): number {
  return config.approvals?.timeoutMs ?? 30 * 60 * 1000;
}
