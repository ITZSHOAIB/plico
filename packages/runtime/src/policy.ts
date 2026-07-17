import type {
  ApprovalPolicyConfig,
  DeclaredTool,
  PolicyResult,
  SideEffectCategory,
} from "./types.js";

const DESTRUCTIVE_KEYWORDS = ["delete", "destroy", "drop", "remove", "purge", "wipe", "admin"];

function matchesRule(
  tool: DeclaredTool,
  rule: { capabilities?: string[]; sideEffectCategory?: SideEffectCategory },
): boolean {
  if (rule.capabilities !== undefined) {
    const hasMatching = rule.capabilities.some((cap) => tool.capabilities.includes(cap));
    if (!hasMatching) return false;
  }

  if (rule.sideEffectCategory !== undefined) {
    if (tool.sideEffectCategory !== rule.sideEffectCategory) return false;
  }

  return true;
}

function inferSideEffectCategory(tool: DeclaredTool): SideEffectCategory {
  if (tool.sideEffectCategory !== undefined) return tool.sideEffectCategory;

  for (const cap of tool.capabilities) {
    const lower = cap.toLowerCase();
    if (DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw))) return "destructive";
    if (lower.includes(":write") || lower.includes(":create") || lower.includes(":update")) {
      return "write";
    }
    if (lower.includes(":read") || lower.includes(":list") || lower.includes(":get")) {
      return "read";
    }
  }

  return "none";
}

export function evaluatePolicy(
  tool: DeclaredTool,
  projectConfig: { approvalPolicy?: ApprovalPolicyConfig },
  _options?: { runtimeMode?: "dry_run" | "provider_backed" },
): PolicyResult {
  const rules = projectConfig.approvalPolicy?.rules ?? [];
  for (const rule of rules) {
    if (matchesRule(tool, rule.match)) {
      return {
        decision: rule.decision,
        reason: rule.reason ?? `Matched project approval rule for ${tool.name}`,
        ...(rule.timeout !== undefined ? { timeout: rule.timeout } : {}),
      };
    }
  }

  const inferredCategory = inferSideEffectCategory(tool);
  if (inferredCategory === "destructive" && !tool.approval.required) {
    return {
      decision: "require_approval",
      reason: `Tool "${tool.name}" has destructive side effects and requires approval`,
    };
  }

  if (tool.approval.required) {
    return {
      decision: "require_approval",
      reason: tool.approval.reason ?? `Tool "${tool.name}" requires approval`,
    };
  }

  return {
    decision: "allow",
    reason: `Tool "${tool.name}" does not require approval`,
  };
}
