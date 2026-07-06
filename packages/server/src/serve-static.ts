import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join, normalize } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export async function serveStaticFile(
  root: string,
  pathname: string,
  response: ServerResponse,
): Promise<boolean> {
  const safePath = normalize(join(root, pathname === "/" ? "index.html" : pathname));
  if (!safePath.startsWith(root)) {
    return false;
  }

  try {
    const content = await readFile(safePath);
    const ext = safePath.substring(safePath.lastIndexOf("."));
    response.statusCode = 200;
    response.setHeader("content-type", MIME_TYPES[ext] ?? "application/octet-stream");
    response.end(content);
    return true;
  } catch {
    return false;
  }
}
