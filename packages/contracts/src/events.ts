import type { ArtifactContent } from "./artifacts.js";
import type { McpTool } from "./mcp.js";
import type { ValidationIssue } from "./project.js";
import type { JsonSchema } from "./tools.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ModelToolCall {
  id?: string;
  name: string;
  arguments: unknown;
  providerMetadata?: JsonValue;
}

export interface PlicoEventPayloads {
  "run.started": {
    projectRoot: string;
    projectName: string;
    threadId?: string;
    metadata?: Record<string, JsonValue>;
    context?: Record<string, JsonValue>;
    /** The agent this run executes. Absent on runs recorded before named agents. */
    agentId?: string;
    /** The workflow a root run executes. */
    workflowId?: string;
    /** Set on a child run: the run that delegated to it or called it from a workflow. */
    parentRunId?: string;
    /** Set on a child run: the run whose engine run executes it. */
    rootRunId?: string;
  };
  "instructions.composed": {
    length: number;
    sources: string[];
    content: string;
    /** The skills the run started with, so a resumed run keeps them. Absent on older runs. */
    skills?: Array<{ name: string; description: string; source: string; body: string }>;
    /** The output schema the run started with. Absent on runs without structured output. */
    outputSchema?: JsonSchema;
  };
  "tools.discovered": {
    tools: Array<{
      source: string;
      name: string;
      description: string;
      inputSchema: unknown;
      capabilities: string[];
      approval: { required: boolean; reason?: string };
      mcp?: Pick<McpTool, "serverId" | "toolName">;
    }>;
    /** Hash of tool files, MCP source configuration and approval policy for safe recovery. */
    fingerprint?: string;
  };
  "input.received": { content: string };
  "model.request": {
    outputSchema?: JsonSchema;
    model?: { provider: string; name: string };
    messages: Array<{
      role: string;
      content: string;
      toolName?: string;
      toolCallId?: string;
      toolCalls?: ModelToolCall[];
      providerMetadata?: JsonValue;
    }>;
    maxSteps: number;
    tools: Array<{ name: string; description: string; inputSchema: unknown }>;
  };
  "model.attempt": { turn: number; attemptId: string };
  "model.delta": { turn: number; attemptId: string; text: string };
  "model.response": {
    attemptId?: string;
    providerMetadata?: JsonValue;
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls?: ModelToolCall[] | undefined;
  };
  "assistant.output": { content: string };
  "tool.call": { toolName: string; arguments: unknown };
  "tool.result": { toolName: string; result: unknown };
  "approval.requested": {
    requestId: string;
    /** The child run that asked, when this is a copy in an ancestor's stream. */
    runId?: string;
    toolName: string;
    arguments: unknown;
    approval: { required: boolean; reason?: string };
  };
  "approval.decided": {
    requestId: string;
    /** The child run that asked, when this is a copy in an ancestor's stream. */
    runId?: string;
    approved: boolean;
    /** The context of whoever decided, as the host passed it. */
    context?: Record<string, JsonValue>;
  };
  "artifact.workspace.created": { workspaceId: string };
  "artifact.file.written": {
    path: string;
    content: ArtifactContent;
    mimeType: string;
    contentHash?: string;
    version?: number;
  };
  "artifact.snapshot.created": { snapshotId: string; fileCount: number };
  "run.completed": { output?: string; structuredOutput?: JsonValue };
  /** `runId` names the child run that waits, when this is a copy in an ancestor's stream. */
  "run.waiting": { requestId: string; toolName: string; output?: string; runId?: string };
  /** A supervisor delegated, or a workflow called an agent. `runId` is the child run. */
  "agent.called": { runId: string; agentId: string; task: string };
  /** The child run ended. Its usage is summed into this run. */
  "agent.returned": {
    runId: string;
    agentId: string;
    status: "completed" | "failed" | "cancelled";
    output?: string;
    structuredOutput?: JsonValue;
    usage: { inputTokens: number; outputTokens: number };
    error?: string;
  };
  /** A workflow began a durable `step(name, fn)`. */
  "workflow.step": { name: string };
  "run.failed": { phase: string };
  "run.cancelled": Record<string, never>;
  "run.warning": { phase: string; message: string; serverId?: string };
  "run.error": { phase: string; message?: string; issues?: ValidationIssue[]; toolName?: string };
}

export type PlicoEventType = keyof PlicoEventPayloads;
export type EventStreamType = "run" | "thread";

interface EventEnvelope {
  schemaVersion: 1;
  streamType: "run";
  /** Canonical location in the log. */
  streamId: string;
  /** Always equals `streamId` on run streams. */
  runId: string;
  id: string;
  sequence: number;
  timestamp: string;
}

export type PlicoEvent<T extends PlicoEventType = PlicoEventType> = {
  [K in T]: EventEnvelope & { type: K; payload: PlicoEventPayloads[K] };
}[T];
