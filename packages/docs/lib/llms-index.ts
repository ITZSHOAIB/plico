import { siteUrl } from "./shared";

const header = `# Plico

> Plico is a TypeScript kit that turns a folder of Markdown instructions, skills and TypeScript tools into a runnable, inspectable AI agent: runs, an event log, human approvals, evals and a local Studio. Developer preview, published on npm as \`@plico-ai/*\` and \`create-plico\`. Needs Node 22.18 or later.

Start with \`npm create plico@latest my-agent\`, then read Project layout, Tools, Approvals and Evals. A project is \`agent.md\`, \`plico.config.ts\`, \`skills/\`, \`tools/\`, \`evals/\`, \`artifacts/\` and \`memory/\`. Verify work with \`plico validate\`, \`plico eval\` and \`plico run --dry\`, none of which need an API key. Every page below is plain Markdown. Full docs in one file: ${siteUrl}/llms-full.txt

`;

/** The llms.txt index: a project summary, then every docs page with an absolute Markdown URL. */
export function toLlmsIndex(pages: string): string {
  const body = pages.replace(/^# .*\n+/, "").replaceAll("](/", `](${siteUrl}/`);
  return `${header}${body}`;
}
