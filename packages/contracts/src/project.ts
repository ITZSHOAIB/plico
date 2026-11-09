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
  artifacts?: { access: "read-write" | "read-only" | "off" };
  model?: {
    provider: string;
    name: string;
    /** Endpoint for `openai-compatible` (and `openai`). */
    baseURL?: string;
    /** Environment variable holding the API key. Defaults to the provider's usual variable. */
    apiKeyEnv?: string;
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

/** What the default export of `providers/<name>.ts` receives. It returns an AI SDK language model. */
export interface ProviderInput {
  model: string;
  /** The value of the variable named by `model.apiKeyEnv`, when the config names one. */
  apiKey?: string;
  baseURL?: string;
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
