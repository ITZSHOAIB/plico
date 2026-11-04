export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ProjectConfig {
  schemaVersion: number;
  name: string;
  description?: string;
  template?: string;
  model?: {
    provider: string;
    name: string;
    maxSteps?: number;
    retries?: number;
    retryDelayMs?: number;
  };
  execution?: { leaseMs?: number };
  approvals?: {
    default?: "none" | "required";
    timeoutMs?: number;
    tools?: Record<string, "none" | "required">;
  };
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
