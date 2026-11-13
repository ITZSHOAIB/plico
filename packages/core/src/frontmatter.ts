import { parse } from "yaml";

export interface Frontmatter {
  /** Parsed YAML keys. Empty when there is no frontmatter or it is not valid YAML. */
  data: Record<string, unknown>;
  /** The text after the closing `---` line, or the whole text when there is no frontmatter. */
  body: string;
  /** Why the frontmatter block could not be read as a YAML mapping. */
  error?: string;
}

/** Splits a leading `---` YAML block from the rest of a Markdown file. */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "---") return { data: {}, body: text };
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end === -1) return { data: {}, body: text };

  const body = lines.slice(end + 1).join("\n");
  try {
    const data: unknown = parse(lines.slice(1, end).join("\n"));
    if (data === null || data === undefined) return { data: {}, body };
    if (typeof data !== "object" || Array.isArray(data)) {
      return { data: {}, body, error: "frontmatter must be a mapping of keys to values" };
    }
    return { data: data as Record<string, unknown>, body };
  } catch (error) {
    return { data: {}, body, error: error instanceof Error ? error.message : String(error) };
  }
}
