import { isMap, isSeq, LineCounter, type Node, parseDocument } from "yaml";

export type YamlPath = ReadonlyArray<string | number>;

export interface LocatedFrontmatter {
  /** Parsed YAML keys, or undefined when the file has no frontmatter block. */
  data?: unknown;
  /** The text after the closing `---` line. */
  body: string;
  /** Line of the body's first line in the file. */
  bodyLine: number;
  /** 1-based file line of the key or item at `path`, or of the frontmatter's start when absent. */
  lineAt(path: YamlPath): number;
  /** Why the frontmatter is not valid YAML, at its file line. */
  error?: { message: string; line: number };
}

/**
 * Like `parseFrontmatter`, but keeps where each key sits so diagnostics can point at a line. The
 * opening `---` is line 1, so YAML line n is file line n + 1.
 */
export function parseLocatedFrontmatter(text: string): LocatedFrontmatter {
  const lines = text.split("\n");
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (lines[0]?.trimEnd() !== "---" || end === -1)
    return { body: text, bodyLine: 1, lineAt: () => 1 };

  const counter = new LineCounter();
  const document = parseDocument(lines.slice(1, end).join("\n"), { lineCounter: counter });
  const toFileLine = (offset: number) => counter.linePos(offset).line + 1;
  const body = lines.slice(end + 1).join("\n");
  const located = { body, bodyLine: end + 2 };

  const [first] = document.errors;
  if (first)
    return {
      ...located,
      data: {},
      lineAt: () => 1,
      error: {
        message: first.message.split("\n")[0] ?? first.message,
        line: toFileLine(first.pos[0]),
      },
    };

  const lineAt = (path: YamlPath): number => {
    let node: unknown = document.contents;
    let line = 1;
    for (const segment of path) {
      if (isMap(node)) {
        const pair = node.items.find(
          (item) => (item.key as { value?: unknown })?.value === segment,
        );
        if (!pair) return line;
        line = toFileLine((pair.key as Node).range?.[0] ?? 0);
        node = pair.value;
      } else if (isSeq(node) && typeof segment === "number") {
        const item = node.items[segment] as Node | undefined;
        if (!item) return line;
        line = toFileLine(item.range?.[0] ?? 0);
        node = item;
      } else return line;
    }
    return line;
  };

  return { ...located, data: document.toJS() ?? {}, lineAt };
}
