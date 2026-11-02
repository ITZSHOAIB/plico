import type { ValidationIssue } from "./project.js";

export interface PlicoEventPayloads {
  "run.started": { projectRoot: string; projectName: string };
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
    messages: Array<{ role: string; content: string; toolName?: string; toolCallId?: string }>;
    maxSteps: number;
    tools: Array<{ name: string; description: string; inputSchema: unknown }>;
  };
  "model.response": {
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls?: Array<{ name: string; arguments: unknown }> | undefined;
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
  "artifact.workspace.created": { workspaceId: string };
  "artifact.file.written": { path: string; content: string; mimeType: string };
  "artifact.snapshot.created": { snapshotId: string; fileCount: number };
  "run.completed": { output?: string };
  "run.waiting": { requestId: string; toolName: string };
  "run.failed": { phase: string };
  "run.cancelled": Record<string, never>;
  "run.error": { phase: string; message?: string; issues?: ValidationIssue[]; toolName?: string };
}

export type PlicoEventType = keyof PlicoEventPayloads;
export type EventStreamType = "run";

interface EventEnvelope {
  schemaVersion: 1;
  streamType: EventStreamType;
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
