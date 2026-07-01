import type { IncomingMessage } from "node:http";
import { HttpError } from "./errors.js";

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(request);

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || Array.isArray(parsed)) {
      throw new Error("Expected JSON object body.");
    }

    return parsed;
  } catch {
    throw new HttpError(400, "request.invalid_json", "Malformed JSON body.");
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
