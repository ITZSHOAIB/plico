import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAgents, validateProject } from "./index.js";

interface Files {
  [path: string]: string;
}

async function project(files: Files, config = ""): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-agents-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents", "workflows"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Agents", ${config} };`,
  );
  const all: Files = { "agent.md": "# Ops\n\nAnswer ops tickets.\n", ...files };
  for (const [path, text] of Object.entries(all)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const researcher = "---\ndescription: Finds facts.\n---\nYou research tickets.\n";
const tool = (name: string, approval = false) =>
  `export default { name: "${name}", description: "${name}", inputSchema: { type: "object" }, capabilities: [], approval: { required: ${approval} }, handler: async () => "ok" };`;

async function messages(root: string): Promise<string[]> {
  return (await validateProject(root)).errors.map((issue) => `${issue.path}: ${issue.message}`);
}

describe("named agents", () => {
  it("keeps a single-agent project valid and reads it as main", async () => {
    const root = await project({});

    expect((await validateProject(root)).ok).toBe(true);
    expect((await readAgents(root)).agents.map((agent) => agent.id)).toEqual(["main"]);
  });

  it("reads agents/<id>.md with frontmatter and applies defaults", async () => {
    const root = await project(
      {
        "agent.md": "---\nagents: [researcher]\n---\nYou answer tickets.\n",
        "agents/researcher.md":
          "---\ndescription: Finds facts.\nmodel:\n  name: small\ntools: [search]\nskills: []\nartifacts: read-only\n---\nYou research.\n",
        "tools/search.tool.ts": tool("search"),
      },
      'model: { provider: "openai", name: "big" }',
    );

    expect(await messages(root)).toEqual([]);
    const { agents } = await readAgents(root);
    expect(agents).toMatchObject([
      { id: "main", source: "agent.md", agents: ["researcher"] },
      {
        id: "researcher",
        source: "agents/researcher.md",
        description: "Finds facts.",
        model: { name: "small" },
        tools: ["search"],
        skills: [],
        agents: [],
        artifacts: "read-only",
        instructions: "You research.\n",
      },
    ]);
    expect(agents[0]?.tools).toBeUndefined();
  });

  it("rejects agents/main.md and invalid IDs", async () => {
    const root = await project({
      "agents/main.md": researcher,
      "agents/Bad Name.md": researcher,
    });

    expect(await messages(root)).toEqual([
      expect.stringContaining("agents/Bad Name.md: Agent ID"),
      expect.stringContaining("agents/main.md: main is root agent.md"),
    ]);
  });

  it("reports invalid frontmatter fields", async () => {
    const root = await project({
      "agents/a.md":
        "---\ntools: search\nmodel: fast\nartifacts: all\nmaxDelegations: 0\n---\nA.\n",
      "agents/b.md": "---\ndescription: [x\n---\nB.\n",
    });

    const errors = await messages(root);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("agents/a.md: Expected tools to be a list"),
        expect.stringContaining("agents/a.md: Expected model to be a mapping"),
        expect.stringContaining('agents/a.md: Expected artifacts to be "read-write"'),
        expect.stringContaining("agents/a.md: Expected maxDelegations to be a positive"),
        expect.stringContaining("agents/b.md: Invalid frontmatter"),
      ]),
    );
  });

  it("reports unknown tool, skill and agent references", async () => {
    const root = await project({
      "agent.md": "---\nagents: [ghost]\ntools: [nope]\nskills: [missing]\n---\nYou answer.\n",
    });

    expect(await messages(root)).toEqual([
      expect.stringContaining('agent.md: Unknown tool "nope"'),
      expect.stringContaining('agent.md: Unknown skill "missing"'),
      expect.stringContaining('agent.md: Unknown agent "ghost"'),
    ]);
  });

  it("requires a description on a delegated agent", async () => {
    const root = await project({
      "agent.md": "---\nagents: [helper]\n---\nYou answer.\n",
      "agents/helper.md": "Help.\n",
    });

    expect(await messages(root)).toEqual([
      expect.stringContaining("agents/helper.md: helper needs a description"),
    ]);
  });

  it("rejects delegation cycles", async () => {
    const root = await project({
      "agents/a.md": "---\ndescription: A.\nagents: [b]\n---\nA.\n",
      "agents/b.md": "---\ndescription: B.\nagents: [a]\n---\nB.\n",
    });

    expect(await messages(root)).toEqual([
      expect.stringContaining("Delegation cycle: a -> b -> a"),
    ]);
  });

  it("rejects delegate tool names that collide with project tools", async () => {
    const root = await project({
      "agent.md": "---\nagents: [researcher]\n---\nYou answer.\n",
      "agents/researcher.md": researcher,
      "tools/delegate.tool.ts": tool("delegate_researcher"),
    });

    expect(await messages(root)).toEqual([
      expect.stringContaining("agent.md: delegate_researcher collides with the project tool"),
    ]);
  });

  it("rejects an agent that widens the project's artifact access", async () => {
    const root = await project(
      { "agents/writer.md": "---\nartifacts: read-write\n---\nWrite.\n" },
      'artifacts: { access: "read-only" }',
    );

    expect(await messages(root)).toEqual([
      expect.stringContaining("agents/writer.md: artifacts can only narrow"),
    ]);
  });

  it("requires a provider when the project has no model", async () => {
    const root = await project({ "agents/a.md": "---\nmodel:\n  name: small\n---\nA.\n" });

    expect(await messages(root)).toEqual([
      expect.stringContaining("agents/a.md: model needs a provider"),
    ]);
  });

  it("rejects an agent model provider that is neither native nor in providers/", async () => {
    const root = await project({
      "agents/a.md": "---\nmodel:\n  provider: bogus\n  name: small\n---\nA.\n",
      "agents/b.md": "---\nmodel:\n  provider: custom\n  name: small\n---\nB.\n",
      "providers/custom.ts": "export default {};\n",
    });

    expect(await messages(root)).toEqual([
      expect.stringContaining('agents/a.md: Unknown model provider "bogus"'),
    ]);
  });

  it("reports a tool file without a name against the tool file", async () => {
    const root = await project({
      "agent.md": "---\ntools: [lookup]\n---\nYou answer.\n",
      "tools/lookup.tool.ts": 'export default { description: "x", handler: async () => "ok" };',
    });

    const [first] = await messages(root);
    expect(first).toBe("tools/lookup.tool.ts: Tool name must be a string");
  });

  it("checks that entry names an agent or workflow", async () => {
    expect(await messages(await project({}, 'entry: "ghost"'))).toEqual([
      expect.stringContaining('plico.config.ts: entry "ghost" is not an agent or workflow'),
    ]);
    expect(
      await messages(await project({ "agents/researcher.md": researcher }, 'entry: "researcher"')),
    ).toEqual([]);
  });
});
