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
  | "run.error";

export interface PlicoEvent {
  schemaVersion: 1;
  streamType: "run";
  streamId: string;
  runId: string;
  id: string;
  sequence: number;
  timestamp: string;
  type: PlicoEventType;
  payload: Record<string, unknown>;
}
