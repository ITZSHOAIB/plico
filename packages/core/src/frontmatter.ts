export interface Frontmatter {
  /** Top-level scalar keys. Nested values are not supported. */
  data: Record<string, string>;
  /** The text after the closing `---` line, or the whole text when there is no frontmatter. */
  body: string;
}

/**
 * Splits a leading `---` block of `key: value` lines from the rest of a Markdown file. Values may
 * be plain, single- or double-quoted, or a `>` (folded) or `|` (literal) block.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "---") return { data: {}, body: text };
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end === -1) return { data: {}, body: text };

  const data: Record<string, string> = {};
  const block = lines.slice(1, end).map((line) => line.trimEnd());
  for (let index = 0; index < block.length; index++) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(block[index] ?? "");
    if (!match) continue;
    const [, key = "", rawValue = ""] = match;
    const style = /^([>|])[+-]?$/.exec(rawValue)?.[1];
    if (!style) {
      data[key] = unquote(rawValue.trim());
      continue;
    }
    const continuation: string[] = [];
    while (index + 1 < block.length && /^(\s|$)/.test(block[index + 1] ?? "")) {
      continuation.push((block[++index] ?? "").trim());
    }
    data[key] = (
      style === ">" ? continuation.filter(Boolean).join(" ") : continuation.join("\n")
    ).trim();
  }
  return { data, body: lines.slice(end + 1).join("\n") };
}

function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote))
    return value.slice(1, -1);
  return value;
}
