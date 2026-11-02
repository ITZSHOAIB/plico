import type { PlicoEventPayloads } from "@plico/contracts";

export class RuntimeDiagnosticError extends Error {
  constructor(readonly payload: PlicoEventPayloads["run.error"]) {
    super(typeof payload.message === "string" ? payload.message : "Runtime diagnostic error");
  }
}

export class RunWaitingError extends Error {}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown runtime error";
}

export function runtimeErrorPayload(error: unknown): PlicoEventPayloads["run.error"] {
  if (error instanceof RuntimeDiagnosticError) {
    return error.payload;
  }

  return {
    phase: "runtime",
    message: errorMessage(error),
  };
}
