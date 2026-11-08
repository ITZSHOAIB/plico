import { HttpError } from "./errors.js";

/** Like `readJsonBody`, but an empty body is `{}` so a bare POST still works. */
export async function readOptionalJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await readBody(request);
  return raw.trim() === "" ? {} : parseJsonBody(request, raw);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  return parseJsonBody(request, await readBody(request));
}

function parseJsonBody(request: Request, raw: string): Record<string, unknown> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new HttpError(
      415,
      "request.unsupported_media_type",
      "Send the request body as application/json.",
    );
  }

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

export const MAX_BODY_BYTES: number = 1024 * 1024;

async function readBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function tooLarge(): HttpError {
  return new HttpError(413, "request.too_large", "Request body is too large.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
