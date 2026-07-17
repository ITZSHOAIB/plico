export interface LoadedProject {
  root: string;
  configPath: string;
  config: {
    schemaVersion: number;
    name: string;
    description?: string;
    template?: string;
  };
}

export type RunStatus = "completed" | "failed" | "blocked" | "cancelled";

export interface RunSummary {
  runId: string;
  projectRoot: string;
  projectName: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string;
  output?: string;
}

export interface PlicoEvent {
  schemaVersion: 1;
  runId: string;
  id: string;
  sequence: number;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface ArtifactFile {
  path: string;
  content: string;
  mimeType: string;
}

export interface ArtifactSnapshot {
  snapshotId: string;
  fileCount: number;
  createdAt: string;
}

export interface ArtifactWorkspace {
  workspaceId: string;
  runId: string;
  files: ArtifactFile[];
  snapshots: ArtifactSnapshot[];
  createdAt: string;
}

export interface EvalCaseResult {
  name: string;
  description?: string;
  status: "pass" | "fail";
  runId: string;
  runStatus: string;
  output?: string;
  diagnostics?: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}

export interface ComposedInstructions {
  sources: string[];
  content: string;
}

export interface ReadinessDiagnostic {
  severity: "ok" | "warning" | "error";
  subsystem: string;
  path?: string;
  message: string;
}

export interface ReadinessReport {
  projectRoot: string;
  timestamp: string;
  diagnostics: ReadinessDiagnostic[];
  summary: {
    ok: number;
    warning: number;
    error: number;
  };
}
