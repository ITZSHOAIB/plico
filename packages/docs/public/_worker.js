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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
