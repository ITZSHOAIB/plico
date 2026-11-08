import { llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { toAgentMarkdown } from "./agent-markdown";
import { docsRoute, getMarkdownUrl } from "./shared";

const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const docsLlms = llms(source, {
  // Point agents at the Markdown version of each page, not the HTML one.
  renderUrl: (item) => getMarkdownUrl(item.url),
  renderPage: async (page) => {
    const description = page.data.description
      ? `

> ${page.data.description}`
      : "";
    const body = toAgentMarkdown(await page.data.getText("processed"));
    return `# ${page.data.title} (${page.url})${description}

${body}`;
  },
});
