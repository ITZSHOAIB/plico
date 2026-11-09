import type { PlicoEventPayloads } from "@plico-ai/contracts";

export class RuntimeDiagnosticError extends Error {
  constructor(readonly payload: PlicoEventPayloads["run.error"]) {
    super(typeof payload.message === "string" ? payload.message : "Runtime diagnostic error");
  }
}

export class RunWaitingError extends Error {
  constructor(readonly output: string | undefined) {
    super("Run waiting for approval");
  }
}

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

export type ModelErrorKind =
  | "rate_limit"
  | "overloaded"
  | "auth"
  | "bad_request"
  | "context_length"
  | "aborted"
  | "network";

/** Provider adapters normalize errors to these provider-neutral kinds. */
export class ModelProviderError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly kind: ModelErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ModelProviderError";
    this.retryable = kind === "rate_limit" || kind === "overloaded" || kind === "network";
  }
}
