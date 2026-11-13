// Cloudflare Pages advanced-mode worker. Serves the static build, and answers docs pages with
// their Markdown version when the client asks for `Accept: text/markdown` (agents and curl).
const DOCS = "/docs";

function wantsMarkdown(accept) {
  const markdown = accept.indexOf("text/markdown");
  const html = accept.indexOf("text/html");
  return markdown !== -1 && (html === -1 || markdown < html);
}

function isDocsPath(pathname) {
  return pathname === DOCS || pathname.startsWith(`${DOCS}/`);
}

const MEDIA = "/media/";

/** Parses a single `bytes=` range against a file size; null when unsatisfiable. */
function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

// Pages assets ignore `Range`, and Safari will not play a video without 206 responses.
async function serveMedia(request, env) {
  const response = await env.ASSETS.fetch(new Request(request.url));
  const range = request.headers.get("range");
  if (!response.ok || !range) {
    const full = new Response(response.body, response);
    if (response.ok) full.headers.set("accept-ranges", "bytes");
    return full;
  }
  const body = await response.arrayBuffer();
  const bytes = byteRange(range, body.byteLength);
  const headers = new Headers(response.headers);
  headers.set("accept-ranges", "bytes");
  if (!bytes) {
    headers.set("content-range", `bytes */${body.byteLength}`);
    headers.delete("content-length");
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-range", `bytes ${bytes.start}-${bytes.end}/${body.byteLength}`);
  headers.set("content-length", String(bytes.end - bytes.start + 1));
  return new Response(body.slice(bytes.start, bytes.end + 1), { status: 206, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.startsWith(MEDIA)) return serveMedia(request, env);
    if (request.method !== "GET" || !isDocsPath(url.pathname)) return env.ASSETS.fetch(request);

    if (wantsMarkdown(request.headers.get("accept") ?? "")) {
      const slug = url.pathname.replace(/\/$/, "").slice(DOCS.length);
      const markdown = await env.ASSETS.fetch(new URL(`/llms.mdx/docs${slug}/content.md`, url));
      if (markdown.ok) {
        return new Response(markdown.body, {
          headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept" },
        });
      }
    }

    const response = await env.ASSETS.fetch(request);
    const varied = new Response(response.body, response);
    varied.headers.append("vary", "Accept");
    return varied;
  },
};
