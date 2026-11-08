import { describe, expect, it } from "vitest";
import { toAgentMarkdown } from "./agent-markdown";

describe("toAgentMarkdown", () => {
  it("turns a single-line Callout into a labelled blockquote", () => {
    expect(toAgentMarkdown("<Callout>Needs Node 22.</Callout>")).toBe("> **Note:** Needs Node 22.");
  });

  it("labels a multi-line warning Callout and keeps inline code", () => {
    const out = toAgentMarkdown(
      [
        '<Callout type="warn">',
        "  Not on npm yet. Run `pnpm build`.",
        "  Then use the CLI.",
        "</Callout>",
      ].join("\n"),
    );
    expect(out).toBe(
      ["> **Warning:** Not on npm yet. Run `pnpm build`.", "> Then use the CLI."].join("\n"),
    );
  });

  it("flattens Steps and dedents their content, including code fences", () => {
    const out = toAgentMarkdown(
      [
        "<Steps>",
        "  <Step>",
        "    ### First",
        "",
        "    ```bash",
        "    plico validate",
        "    ```",
        "  </Step>",
        "</Steps>",
      ].join("\n"),
    );
    expect(out).toBe(["### First", "", "```bash", "plico validate", "```"].join("\n"));
  });

  it("turns Cards into a link list", () => {
    const out = toAgentMarkdown(
      ["<Cards>", '  <Card title="Tools" href="/docs/tools">Typed tools.</Card>', "</Cards>"].join(
        "\n",
      ),
    );
    expect(out).toBe("- [Tools](/docs/tools): Typed tools.");
  });

  it("leaves JSX-looking text inside code fences alone", () => {
    const fenced = ["```tsx", "<Callout>kept</Callout>", "```"].join("\n");
    expect(toAgentMarkdown(fenced)).toBe(fenced);
  });

  it("separates consecutive steps with a blank line", () => {
    const steps = ["<Steps>", "  <Step>", "    ### A", "    one", "  </Step>"];
    steps.push("  <Step>", "    ### B", "  </Step>", "</Steps>");
    expect(toAgentMarkdown(steps.join("\n"))).toBe("### A\none\n\n### B");
  });

  it("drops heading anchor ids", () => {
    expect(toAgentMarkdown("## Open Studio [#open-studio]")).toBe("## Open Studio");
  });
});
