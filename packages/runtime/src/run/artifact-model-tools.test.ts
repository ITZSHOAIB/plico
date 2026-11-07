import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runProject } from "../index.js";
import type { ModelRequest } from "../types/index.js";

async function scaffold(config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-model-artifacts-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(join(root, "plico.config.ts"), config);
  await writeFile(join(root, "agent.md"), "# Demo");
  return root;
}

async function availableTools(config: string): Promise<string[]> {
  const root = await scaffold(config);
  let tools: ModelRequest["tools"] = [];
  const run = await runProject(root, {
    message: "Check my workspace",
    provider: {
      async *stream(request) {
        tools = request.tools;
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  expect(run.status).toBe("completed");
  return tools?.map((tool) => tool.name) ?? [];
}

it("offers Plico artifact tools according to the configured access mode", async () => {
  expect(await availableTools('export default { schemaVersion: 1, name: "Demo" };')).toEqual([
    "list_files",
    "read_file",
    "write_file",
    "edit_file",
  ]);
  expect(
    await availableTools(
      'export default { schemaVersion: 1, name: "Demo", artifacts: { access: "read-only" } };',
    ),
  ).toEqual(["list_files", "read_file"]);
  expect(
    await availableTools(
      'export default { schemaVersion: 1, name: "Demo", artifacts: { access: "off" } };',
    ),
  ).toEqual([]);
});

it("lets a provider list, read, write, and exact-edit text artifacts", async () => {
  const root = await scaffold('export default { schemaVersion: 1, name: "Demo" };');
  const calls = [
    {
      name: "write_file",
      arguments: { path: "reports/summary.md", content: "first\nsecond\nthird\n" },
    },
    {
      name: "read_file",
      arguments: { path: "reports/summary.md", offset: 2, limit: 2 },
    },
    {
      name: "edit_file",
      arguments: { path: "reports/summary.md", old: "second", new: "revised" },
    },
    { name: "list_files", arguments: { glob: "reports/*.{md,txt}" } },
  ];
  let turn = 0;
  const run = await runProject(root, {
    runId: "provider-artifact-tools",
    message: "Create and update the report",
    provider: {
      async *stream() {
        const call = calls[turn++];
        if (call) yield { type: "tool.call", call };
        else yield { type: "text", text: "Report updated" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const results = run.events
    .filter((event) => event.type === "tool.result")
    .map((event) => (event.type === "tool.result" ? event.payload.result : undefined));
  const writes = run.events.filter((event) => event.type === "artifact.file.written");

  expect(run.status).toBe("completed");
  expect(results).toEqual([
    { path: "reports/summary.md", version: 1 },
    {
      path: "reports/summary.md",
      content: "second\nthird\n",
      mimeType: "text/markdown",
      version: 1,
      offset: 2,
    },
    { path: "reports/summary.md", version: 2, replacementCount: 1 },
    {
      files: [
        {
          path: "reports/summary.md",
          sizeBytes: 20,
          mimeType: "text/markdown",
          version: 2,
        },
      ],
      offset: 0,
    },
  ]);
  expect(writes).toHaveLength(2);
  expect(writes.at(-1)).toMatchObject({
    type: "artifact.file.written",
    payload: { content: "first\nrevised\nthird\n", version: 2 },
  });
});

it("returns built-in artifact tool errors to the model so it can retry", async () => {
  const root = await scaffold('export default { schemaVersion: 1, name: "Demo" };');
  const calls = [
    { name: "write_file", arguments: { path: "report.md", content: "draft" } },
    { name: "edit_file", arguments: { path: "report.md", old: "missing", new: "final" } },
    { name: "edit_file", arguments: { path: "report.md", old: "draft", new: "final" } },
  ];
  const toolMessages: string[][] = [];
  let turn = 0;
  const run = await runProject(root, {
    runId: "provider-artifact-tool-retry",
    message: "Update the report",
    provider: {
      async *stream(request) {
        toolMessages.push(
          request.messages
            .filter((message) => message.role === "tool")
            .map((message) => message.content),
        );
        const call = calls[turn++];
        if (call) yield { type: "tool.call", call };
        else yield { type: "text", text: "Updated" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const writes = run.events.filter((event) => event.type === "artifact.file.written");

  expect(run.status).toBe("completed");
  expect(toolMessages[2]?.at(-1)).toContain(
    '"error":"Text to replace was not found in report.md."',
  );
  expect(writes).toHaveLength(2);
  expect(writes.at(-1)).toMatchObject({
    type: "artifact.file.written",
    payload: { path: "report.md", content: "final", version: 2 },
  });
});

it("refuses a provider call to an artifact tool hidden by read-only access", async () => {
  const root = await scaffold(
    'export default { schemaVersion: 1, name: "Demo", artifacts: { access: "read-only" } };',
  );
  let offered: string[] = [];
  const run = await runProject(root, {
    runId: "provider-artifact-read-only",
    message: "Write a file",
    provider: {
      async *stream(request) {
        offered = request.tools?.map((tool) => tool.name) ?? [];
        yield {
          type: "tool.call",
          call: { name: "write_file", arguments: { path: "report.txt", content: "blocked" } },
        };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });

  expect(offered).toEqual(["list_files", "read_file"]);
  expect(run.status).toBe("failed");
  expect(run.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    phase: "tool.access",
    toolName: "write_file",
    message: expect.stringContaining('artifacts.access="read-only"'),
  });
  expect(run.events.some((event) => event.type === "artifact.file.written")).toBe(false);
});

it("keeps ctx.artifacts available to project tools when model access is off", async () => {
  const root = await scaffold(
    'export default { schemaVersion: 1, name: "Demo", artifacts: { access: "off" } };',
  );
  await writeFile(
    join(root, "tools", "trusted.tool.ts"),
    `export default {
      name: "trusted", description: "Write from project code",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async (_input, { artifacts }) => artifacts.write("reports/from-tool.txt", "trusted"),
    };`,
  );
  let offered: string[] = [];
  let turns = 0;
  const run = await runProject(root, {
    runId: "provider-artifact-off-custom-tool",
    message: "Run the project tool",
    provider: {
      async *stream(request) {
        offered = request.tools?.map((tool) => tool.name) ?? [];
        if (turns++ === 0 && offered.includes("trusted"))
          yield { type: "tool.call", call: { name: "trusted", arguments: {} } };
        else yield { type: "text", text: "Missing trusted tool" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });

  expect(offered).toEqual(["trusted"]);
  expect(run.status).toBe("completed");
  expect(run.events.find((event) => event.type === "artifact.file.written")).toMatchObject({
    payload: { path: "reports/from-tool.txt", content: "trusted" },
  });
});

it("requires replaceAll when an exact edit matches multiple times", async () => {
  const root = await scaffold('export default { schemaVersion: 1, name: "Demo" };');
  const calls = [
    { name: "write_file", arguments: { path: "report.txt", content: "draft draft" } },
    { name: "edit_file", arguments: { path: "report.txt", old: "draft", new: "final" } },
  ];
  let turn = 0;
  const run = await runProject(root, {
    runId: "provider-artifact-ambiguous-edit",
    message: "Replace draft",
    provider: {
      async *stream() {
        const call = calls[turn++];
        if (call) yield { type: "tool.call", call };
        else yield { type: "text", text: "Edited" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const results = run.events
    .filter((event) => event.type === "tool.result")
    .map((event) => (event.type === "tool.result" ? event.payload.result : undefined));

  expect(run.status).toBe("completed");
  expect(results[1]).toEqual({
    error: "Text to replace occurs 2 times in report.txt; set replaceAll to true.",
  });
  expect(run.events.filter((event) => event.type === "artifact.file.written")).toHaveLength(1);
});
