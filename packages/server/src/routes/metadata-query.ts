import { HttpError } from "../errors.js";

/** Reads the `metadata` query parameter, a URL-encoded JSON object, as a list filter. */
export function readMetadataFilter(url: URL): { metadata?: unknown } {
  const raw = url.searchParams.get("metadata");
  if (raw === null) return {};
  try {
    return { metadata: JSON.parse(raw) as unknown };
  } catch {
    throw new HttpError(400, "request.invalid", "metadata must be a URL-encoded JSON object.");
  }
}
