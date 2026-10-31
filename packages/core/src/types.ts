export type {
  LoadedProject,
  ProjectConfig,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
} from "@plico/contracts";

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
