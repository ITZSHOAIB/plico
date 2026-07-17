export type ProjectDirectoryRole = keyof ProjectLayoutDirectories;

export interface ProjectLayoutDirectories {
  skills: "skills";
  tools: "tools";
  evals: "evals";
  artifacts: "artifacts";
  memory: "memory";
}

export interface ProjectLayout {
  configFile: "plico.config.ts";
  agentFile: "agent.md";
  directories: ProjectLayoutDirectories;
}

export interface ProjectRelativePaths {
  configFile: string;
  agentFile: string;
  directories: Record<ProjectDirectoryRole, string>;
}

export interface ProjectPaths {
  configFile: string;
  agentFile: string;
  directories: Record<ProjectDirectoryRole, string>;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export type SideEffectCategory = "none" | "read" | "write" | "destructive";

export interface ApprovalPolicyConfig {
  rules?: ApprovalPolicyRule[];
}

export interface ApprovalPolicyRule {
  match: { tool?: string; subsystem?: string; sideEffectCategory?: SideEffectCategory };
  decision: "allow" | "require_approval";
  reason?: string;
}

export interface ProjectConfig {
  schemaVersion: number;
  name: string;
  description?: string;
  template?: string;
  provider?: Record<string, unknown>;
  approvalPolicy?: ApprovalPolicyConfig;
}

export interface LoadedProject {
  root: string;
  configPath: string;
  config: ProjectConfig;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  project?: LoadedProject;
}
