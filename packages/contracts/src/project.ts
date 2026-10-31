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
