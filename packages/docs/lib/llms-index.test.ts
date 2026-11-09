import { describe, expect, it } from "vitest";
import { toLlmsIndex } from "./llms-index";

describe("toLlmsIndex", () => {
  const out = toLlmsIndex(
    "# Docs\n\n- [Quickstart](/llms.mdx/docs/quickstart/content.md): Start.\n",
  );

  it("opens with the project name and a summary", () => {
    expect(out.startsWith("# Plico\n\n> ")).toBe(true);
  });

  it("makes page links absolute", () => {
    expect(out).toContain("](https://plico.sohab.dev/llms.mdx/docs/quickstart/content.md)");
    expect(out).not.toContain("](/llms.mdx");
  });

  it("drops the generic heading", () => {
    expect(out).not.toContain("# Docs");
  });
});
