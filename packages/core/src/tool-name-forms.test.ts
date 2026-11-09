import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

const body = [
  '  description: "A test tool.",',
  '  inputSchema: { type: "object" },',
  "  capabilities: [],",
  "  approval: { required: false },",
  "  handler: async () => ({}),",
].join("\n");

const plain = `export default {\n  name: "lookup",\n${body}\n};\n`;

async function project(tools: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-tool-forms-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Forms" };\n',
  );
  await writeFile(join(root, "agent.md"), "# Forms\n\nAnswer from the local files.\n");
  for (const [file, text] of Object.entries(tools))
    await writeFile(join(root, "tools", file), text);
  return root;
}

async function duplicates(tools: Record<string, string>): Promise<string[]> {
  const { errors } = await validateProject(await project(tools));
  return errors.map((issue) => issue.message).filter((message) => message.includes("Duplicate"));
}

const duplicate = ['Duplicate tool name "lookup" declared in tools/a.tool.ts and tools/b.tool.ts'];

describe("tool names written in different forms", () => {
  it.each([
    [
      "a defineTool import under another name",
      `import { defineTool as make } from "@plico-ai/sdk";\nexport default make({\n  name: "lookup",\n${body}\n});\n`,
    ],
    [
      "a namespace import of the sdk",
      `import * as plico from "@plico-ai/sdk";\nexport default plico.defineTool({\n  name: "lookup",\n${body}\n});\n`,
    ],
    ["an as const assertion", `export default {\n  name: "lookup",\n${body}\n} as const;\n`],
    [
      "a satisfies clause",
      `export default {\n  name: "lookup",\n${body}\n} satisfies Record<string, unknown>;\n`,
    ],
    [
      "a typed variable that is exported later",
      `const tool: Record<string, unknown> = {\n  name: "lookup",\n${body}\n};\nexport default tool;\n`,
    ],
    [
      "a name held in a typed constant",
      `const toolName: string = "lookup";\nexport default {\n  name: toolName,\n${body}\n};\n`,
    ],
  ])("finds the name through %s", async (_label, text) => {
    expect(await duplicates({ "a.tool.ts": plain, "b.tool.ts": text })).toEqual(duplicate);
  });

  it("ignores a defineTool that does not come from the sdk", async () => {
    const other = `const defineTool = (tool: unknown) => tool;\nexport default defineTool({\n  name: "lookup",\n${body}\n});\n`;

    expect(await duplicates({ "a.tool.ts": plain, "b.tool.ts": other })).toEqual([]);
  });

  it("keeps validating when a tool file has a syntax error", async () => {
    const broken = "export default {{{ name: 'lookup'\n";

    expect(await duplicates({ "a.tool.ts": plain, "b.tool.ts": broken })).toEqual([]);
  });
});
