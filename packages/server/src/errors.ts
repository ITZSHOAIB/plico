import { jsonResponse } from "./responses.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): Response {
  return jsonResponse(status, { error: { code, message } }, headers);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
