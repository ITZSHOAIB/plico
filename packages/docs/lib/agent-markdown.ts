/**
 * Docs pages use a few MDX components. Agents read plain Markdown, so the per-page Markdown,
 * `llms-full.txt` and the Copy Markdown button run the source through this first.
 */
const CALLOUT_LABELS: Record<string, string> = {
  info: "Note",
  warn: "Warning",
  warning: "Warning",
  error: "Error",
  success: "Tip",
  idea: "Tip",
};
const STEP_INDENT = 4;

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1];
}

export function toAgentMarkdown(source: string): string {
  const out: string[] = [];
  let fence = false;
  let indent = 0;
  let callout: { label: string; lines: string[] } | undefined;

  const flushCallout = () => {
    if (!callout) return;
    const [first = "", ...rest] = callout.lines;
    out.push(`> **${callout.label}:** ${first}`, ...rest.map((line) => `> ${line}`));
    callout = undefined;
  };

  for (const raw of source.split("\n")) {
    const line = indent ? raw.replace(new RegExp(`^ {1,${indent}}`), "") : raw;
    const trimmed = line.trim();

    if (callout) {
      if (trimmed.startsWith("</Callout>")) flushCallout();
      else if (trimmed) callout.lines.push(trimmed);
      continue;
    }
    if (/^```/.test(trimmed)) fence = !fence;
    if (fence || /^```/.test(trimmed)) {
      out.push(line);
      continue;
    }

    const open = /^<Callout(?:\s+([^>]*))?>(.*)$/.exec(trimmed);
    if (open) {
      const label = CALLOUT_LABELS[attr(open[1] ?? "", "type") ?? "info"] ?? "Note";
      const rest = open[2] ?? "";
      const closed = rest.endsWith("</Callout>");
      const text = (closed ? rest.slice(0, -"</Callout>".length) : rest).trim();
      callout = { label, lines: text ? [text] : [] };
      if (closed) flushCallout();
      continue;
    }

    const card = /^<Card\s+([^>]*)>(.*)<\/Card>$/.exec(trimmed);
    if (card) {
      const title = attr(card[1] ?? "", "title") ?? "";
      const href = attr(card[1] ?? "", "href") ?? "";
      out.push(`- [${title}](${href})${card[2] ? `: ${card[2].trim()}` : ""}`);
      continue;
    }

    if (trimmed === "<Step>") {
      indent = STEP_INDENT;
      continue;
    }
    if (trimmed === "</Step>") {
      indent = 0;
      out.push("");
      continue;
    }
    if (["<Steps>", "</Steps>", "<Cards>", "</Cards>"].includes(trimmed)) continue;

    out.push(line.replace(/^(#{1,6} .*?) \[#[\w-]+\]$/, "$1"));
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
