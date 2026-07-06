import type { ValidationIssue } from "@plico/core";

export type RunStatus = "completed" | "failed" | "blocked";

export type PlicoEventType =
  | "run.started"
  | "instructions.composed"
  | "tools.discovered"
  | "assistant.output"
  | "tool.call"
  | "tool.result"
  | "approval.required"
  | "artifact.workspace.created"
  | "artifact.file.written"
  | "artifact.snapshot.created"
  | "run.completed"
  | "run.blocked"
  | "run.failed"
  | "run.error";

export interface PlicoEvent {
  schemaVersion: 1;
  runId: string;
  id: string;
  sequence: number;
  timestamp: string;
  type: PlicoEventType;
  payload: Record<string, unknown>;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  events: PlicoEvent[];
  errors?: ValidationIssue[];
}

export interface RunSummary {
  runId: string;
  projectRoot: string;
  projectName: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string;
  output?: string;
}

export interface PersistedRun extends RunSummary {
  events: PlicoEvent[];
}

export interface EventStore {
  persistRun(run: PersistedRun): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
}

export interface EvalExpectation {
  status?: RunStatus;
  outputContains?: string;
}

export interface EvalCase {
  name: string;
  description?: string;
  script: DryRunScriptStep[];
  expect?: EvalExpectation;
}

export interface EvalCaseResult {
  name: string;
  description?: string;
  status: "pass" | "fail";
  runId: string;
  runStatus: RunStatus;
  output?: string;
  diagnostics?: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}

export interface RunEvalsOptions {
  eventStore?: EventStore;
}

export interface CreateSqliteEventStoreOptions {
  databasePath: string;
}

export interface ArtifactFileInput {
  path: string;
  content: string;
  mimeType?: string;
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

export type DryRunScriptStep =
  | {
      type: "assistant.output";
      content: string;
    }
  | {
      type: "tool.call";
      toolName: string;
      arguments: unknown;
    }
  | {
      type: "artifact.write";
      files: ArtifactFileInput[];
    };

export interface RunProjectOptions {
  script?: DryRunScriptStep[];
  eventStore?: EventStore;
  runId?: string;
}

export interface JsonSchemaSubset {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  properties?: Record<string, JsonSchemaSubset>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaSubset;
}

export interface ToolApprovalPolicy {
  required: boolean;
  reason?: string;
}

export interface DeclaredTool {
  source: string;
  name: string;
  description: string;
  inputSchema: JsonSchemaSubset;
  capabilities: string[];
  approval: ToolApprovalPolicy;
  handler: (input: unknown) => unknown | Promise<unknown>;
}

export interface ComposedInstructions {
  sources: string[];
  content: string;
}
