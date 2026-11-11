import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { type ModelProvider, type ModelRequest, runProject } from "../index.js";

const ADD_TOOL = [
  "export default {",
  '  name: "add",',
  '  description: "Add two numbers.",',
  '  inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false },',
  "  capabilities: [],",
  "  approval: { required: false },",
  "  handler: ({ a, b }) => ({ sum: a + b }),",
  "};",
].join("\n");

const FLAKY_TOOL = [
  "let calls = 0;",
  "export default {",
  '  name: "flaky",',
  '  description: "Fails on the first call.",',
  '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
  "  capabilities: [],",
  "  approval: { required: false },",
  '  handler: () => { if (calls++ === 0) throw new Error("backend unavailable"); return { ok: true }; },',
  "};",
].join("\n");

async function scaffold(tools: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-recovery-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  for (const [file, source] of Object.entries(tools))
    await writeFile(join(root, "tools", file), source);
  return root;
}

function scriptedModel(
  turns: Array<{ name: string; arguments: unknown } | string>,
  seen: ModelRequest[] = [],
): ModelProvider {
  let turn = 0;
  return {
    async *stream(request) {
      seen.push(structuredClone(request));
      const next = turns[Math.min(turn++, turns.length - 1)] as (typeof turns)[number];
      const usage = { inputTokens: 1, outputTokens: 1 };
      if (typeof next === "string") yield { type: "text", text: next };
      else yield { type: "tool.call", call: { id: `call-${turn}`, ...next } };
      yield { type: "finish", usage };
    },
  };
}

it("returns invalid tool arguments to the model so it can retry", async () => {
  const root = await scaffold({ "add.tool.ts": ADD_TOOL });
  const seen: ModelRequest[] = [];
  const provider = scriptedModel(
    [
      { name: "add", arguments: { a: "17", b: "25" } },
      { name: "add", arguments: { a: 17, b: 25 } },
      "The sum is 42.",
    ],
    seen,
  );

  const result = await runProject(root, { provider, message: "add 17 and 25" });

  expect(result.status).toBe("completed");
  expect(result.output).toBe("The sum is 42.");
  const results = result.events.filter((event) => event.type === "tool.result");
  expect(results[0]?.payload.result).toMatchObject({ error: expect.stringContaining("invalid") });
  expect(results[1]?.payload.result).toEqual({ sum: 42 });
  const fed = seen[1]?.messages.find((message) => message.role === "tool");
  expect(fed?.content).toContain("invalid");
});

it("returns a throwing tool handler's error to the model", async () => {
  const root = await scaffold({ "flaky.tool.ts": FLAKY_TOOL });
  const provider = scriptedModel([
    { name: "flaky", arguments: {} },
    { name: "flaky", arguments: {} },
    "Done.",
  ]);

  const result = await runProject(root, { provider, message: "go" });

  expect(result.status).toBe("completed");
  const results = result.events.filter((event) => event.type === "tool.result");
  expect(results[0]?.payload.result).toMatchObject({ error: "backend unavailable" });
  expect(results[1]?.payload.result).toEqual({ ok: true });
});

it("returns an unknown tool name to the model", async () => {
  const root = await scaffold({ "add.tool.ts": ADD_TOOL });
  const provider = scriptedModel([{ name: "multiply", arguments: {} }, "I will not multiply."]);

  const result = await runProject(root, { provider, message: "go" });

  expect(result.status).toBe("completed");
  expect(result.events.find((event) => event.type === "tool.result")?.payload.result).toMatchObject(
    {
      error: expect.stringContaining("multiply"),
    },
  );
});

it("fails the run when the model keeps sending invalid tool calls", async () => {
  const root = await scaffold({ "add.tool.ts": ADD_TOOL });
  const provider = scriptedModel([{ name: "add", arguments: {} }]);

  const result = await runProject(root, { provider, message: "go" });

  expect(result.status).toBe("failed");
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    phase: "tool.validation",
    toolName: "add",
  });
  expect(result.events.filter((event) => event.type === "tool.call")).toHaveLength(3);
});
