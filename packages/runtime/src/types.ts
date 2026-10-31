import type {
  ArtifactFile,
  ArtifactSnapshot,
  ArtifactWorkspace,
  ComposedInstructions,
  DiagnosticSeverity,
  EvalCaseResult,
  EvalSummary,
  PlicoEvent,
  PlicoEventType,
  ReadinessDiagnostic,
  ReadinessReport,
  RunResult,
  RunStatus,
  RunSummary,
} from "@plico/contracts";

export type {
  ArtifactFile,
  ArtifactSnapshot,
  ArtifactWorkspace,
  ComposedInstructions,
  DiagnosticSeverity,
  EvalCaseResult,
  EvalSummary,
  PlicoEvent,
  PlicoEventType,
  ReadinessDiagnostic,
  ReadinessReport,
  RunResult,
  RunStatus,
  RunSummary,
};

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

export interface RunEvalsOptions {
  eventStore?: EventStore;
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
