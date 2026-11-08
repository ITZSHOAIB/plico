import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runProject } from "../index.js";
import type { ModelRequest } from "../types/index.js";

async function scaffold(skills: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-skill-loading-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n\nUse your skills.");
  for (const [file, text] of Object.entries(skills))
    await writeFile(join(root, "skills", file), text);
  return root;
}

const triage = "---\ndescription: Sort urgent work first.\n---\n# Triage\n\nFull triage steps.";

it("lists skill names and descriptions in the instructions, not their bodies", async () => {
  const root = await scaffold({ "triage.md": triage });

  const run = await runProject(root);

  const payload = run.events.find((event) => event.type === "instructions.composed")?.payload as {
    content: string;
    sources: string[];
  };
  expect(payload.content).toContain("- triage: Sort urgent work first.");
  expect(payload.content).not.toContain("Full triage steps.");
  expect(payload.sources).toEqual(["agent.md", "skills/triage.md"]);
});

it("offers load_skill only when the project has skills", async () => {
  const offered = async (skills: Record<string, string>) => {
    let tools: ModelRequest["tools"] = [];
    await runProject(await scaffold(skills), {
      message: "Hi",
      provider: {
        async *stream(request) {
          tools = request.tools;
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });
    return (tools ?? []).map((tool) => tool.name).filter((name) => name === "load_skill");
  };

  expect(await offered({ "triage.md": triage })).toEqual(["load_skill"]);
  expect(await offered({})).toEqual([]);
});

it("loads a full skill through a tool call that is recorded as events", async () => {
  const root = await scaffold({ "triage.md": triage });
  const results: string[] = [];
  const calls = [
    { name: "load_skill", arguments: { name: "triage" } },
    { name: "load_skill", arguments: { name: "../agent" } },
  ];
  let turn = 0;

  const run = await runProject(root, {
    message: "Triage this",
    provider: {
      async *stream(request) {
        const last = request.messages.at(-1);
        if (last?.role === "tool") results.push(last.content);
        const call = calls[turn++];
        if (call) yield { type: "tool.call", call };
        else yield { type: "text", text: "Done" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });

  expect(run.status).toBe("completed");
  expect(JSON.parse(results[0] ?? "null")).toEqual({
    name: "triage",
    content: "# Triage\n\nFull triage steps.",
  });
  expect(JSON.parse(results[1] ?? "null")).toMatchObject({
    error: expect.stringContaining("Unknown skill"),
  });
  const types = run.events.map((event) => event.type);
  expect(types.filter((type) => type === "tool.call")).toHaveLength(2);
  expect(run.events.find((event) => event.type === "tool.result")?.payload).toMatchObject({
    toolName: "load_skill",
  });
});
