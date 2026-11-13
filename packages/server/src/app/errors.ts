/** A failure the shared layer reports by code. The HTTP routes map the code to a status. */
export class PlicoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const statusByCode: Record<string, number> = {
  "thread.not_found": 404,
  "run.not_found": 404,
  "workspace.not_found": 404,
  "thread.busy": 409,
  "thread.invalid_title": 400,
  "message.invalid": 400,
  "input.invalid": 400,
  "request.invalid": 400,
  "threads.unavailable": 503,
  "threads.store_mismatch": 503,
  "provider.unavailable": 503,
  "workspace.unavailable": 503,
};

export function statusForCode(code: string): number {
  return statusByCode[code] ?? 500;
}
