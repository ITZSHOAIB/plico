export class RuntimeDiagnosticError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : "Runtime diagnostic error");
  }
}

export class RunBlockedError extends Error {}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown runtime error";
}

export function runtimeErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof RuntimeDiagnosticError) {
    return error.payload;
  }

  return {
    phase: "runtime",
    message: errorMessage(error),
  };
}
