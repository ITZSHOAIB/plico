import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";

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

/** Answers with the file at `pathname` under `root`, or undefined when there is no such file. */
export async function serveStaticFile(
  root: string,
  pathname: string,
): Promise<Response | undefined> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const safePath = normalize(join(resolve(root), decoded === "/" ? "index.html" : decoded));
  const fromRoot = relative(resolve(root), safePath);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return undefined;
  }

  try {
    const content = await readFile(safePath);
    const ext = safePath.substring(safePath.lastIndexOf("."));
    return new Response(content, {
      headers: { "content-type": MIME_TYPES[ext] ?? "application/octet-stream" },
    });
  } catch {
    return undefined;
  }
}
