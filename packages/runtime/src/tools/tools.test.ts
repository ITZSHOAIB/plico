import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "@plico/core";
import { describe, expect, it } from "vitest";
import { discoverTools } from "../index.js";

const toolSource = (name: string) =>
  [
    "export default {",
    `  name: "${name}",`,
    '  description: "A tool.",',
    '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
    "  capabilities: [],",
    "  approval: { required: false },",
    "  handler: async () => ({}),",
    "};",
    "",
  ].join("\n");

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-tools-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  return root;
}

describe("discoverTools", () => {
  it("rejects two tool files that declare the same tool name", async () => {
    const root = await scaffold();
    await writeFile(join(root, "tools", "a.tool.ts"), toolSource("lookup"));
    await writeFile(join(root, "tools", "b.tool.ts"), toolSource("lookup"));

    await expect(discoverTools(await loadProject(root))).rejects.toThrow(
      /Duplicate tool name "lookup".*a\.tool\.ts.*b\.tool\.ts/,
    );
  });

  it("ignores directories whose names look like tool files", async () => {
    const root = await scaffold();
    await mkdir(join(root, "tools", "folder.tool.ts"));
    await writeFile(join(root, "tools", "real.tool.ts"), toolSource("real"));

    const tools = await discoverTools(await loadProject(root));

    expect(tools.map((tool) => tool.name)).toEqual(["real"]);
  });

  it("loads tools with sibling and npm package imports", async () => {
    const root = await scaffold();
    await symlink(
      join(process.cwd(), "packages", "runtime", "node_modules"),
      join(root, "node_modules"),
      "junction",
    );
    await writeFile(join(root, "tools", "helper.ts"), 'export const toolName = "with_imports";\n');
    await writeFile(
      join(root, "tools", "with-imports.tool.ts"),
      [
        'import { toolName } from "./helper.ts";',
        'import { tool } from "ai";',
        "export default {",
        "  name: toolName,",
        '  description: "A tool.",',
        '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
        "  capabilities: [],",
        "  approval: { required: false },",
        '  handler: async () => ({ imported: typeof tool === "function" }),',
        "};",
      ].join("\n"),
    );

    const tools = await discoverTools(await loadProject(root));

    expect(tools[0]).toMatchObject({ name: "with_imports" });
    await expect(
      tools[0]?.handler({}, { signal: new AbortController().signal, idempotencyKey: "test" }),
    ).resolves.toEqual({ imported: true });
  });
});
