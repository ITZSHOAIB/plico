import type { ValidationIssue } from "@plico/core";

export type RunStatus = "completed" | "failed" | "blocked";

export type PlicoEventType =
  | "run.started"
  | "instructions.composed"
  | "tools.discovered"
  | "input.received"
  | "model.request"
  | "model.response"
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
  | "run.error"
  | "thread.created"
  | "message.created";

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

export interface RunMetadata {
  runId: string;
  conversationId: string;
  projectRoot: string;
  projectName: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string;
  output?: string;
}

export interface Thread {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  messageId: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ApprovalRequest {
  requestId: string;
  runId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  decisionReason?: string;
}

export interface PersistedRun extends RunSummary {
  events: PlicoEvent[];
}

export interface EventStore {
  persistRun(run: PersistedRun): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
  getRunMetadata(runId: string): Promise<RunMetadata | undefined>;
  eventsByConversation(conversationId: string): Promise<PlicoEvent[]>;
  listConversations(): Promise<
    Array<{ conversationId: string; runCount: number; lastActivity: string }>
  >;
  createThread(thread: Thread): Promise<void>;
  addMessage(message: Message): Promise<void>;
  listThreads(): Promise<Thread[]>;
  getThread(threadId: string): Promise<Thread | undefined>;
  getThreadMessages(threadId: string): Promise<Message[]>;
  createApprovalRequest(request: ApprovalRequest): Promise<void>;
  getApprovalRequest(requestId: string): Promise<ApprovalRequest | undefined>;
  listPendingApprovals(runId: string): Promise<ApprovalRequest[]>;
  approveToolCall(requestId: string, reason?: string): Promise<void>;
  rejectToolCall(requestId: string, reason?: string): Promise<void>;
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

export type DiagnosticSeverity = "ok" | "warning" | "error";

export interface ReadinessDiagnostic {
  severity: DiagnosticSeverity;
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

export interface ReadinessOptions {
  databasePath?: string;
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

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ModelToolCall {
  name: string;
  arguments: unknown;
}

export interface ModelRequest {
  messages: ProviderMessage[];
  maxSteps: number;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: JsonSchemaSubset;
  }>;
}

export interface ModelResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: ModelToolCall[];
}

export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface RunProjectOptions {
  script?: DryRunScriptStep[];
  eventStore?: EventStore;
  runId?: string;
  provider?: ModelProvider;
  message?: string;
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
