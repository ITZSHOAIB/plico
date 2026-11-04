import type { ValidationIssue } from "./project.js";

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
  "run.started": { projectRoot: string; projectName: string; threadId?: string };
  "instructions.composed": { length: number; sources: string[]; content: string };
  "tools.discovered": {
    tools: Array<{
      source: string;
      name: string;
      description: string;
      inputSchema: unknown;
      capabilities: string[];
      approval: { required: boolean; reason?: string };
    }>;
  };
  "input.received": { content: string };
  "model.request": {
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
    toolName: string;
    arguments: unknown;
    approval: { required: boolean; reason?: string };
  };
  "approval.decided": { requestId: string; approved: boolean };
  "artifact.workspace.created": { workspaceId: string };
  "artifact.file.written": { path: string; content: string; mimeType: string };
  "artifact.snapshot.created": { snapshotId: string; fileCount: number };
  "run.completed": { output?: string };
  "run.waiting": { requestId: string; toolName: string; output?: string };
  "run.failed": { phase: string };
  "run.cancelled": Record<string, never>;
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
