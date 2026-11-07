import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runProject } from "../index.js";

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-artifact-tool-pages-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  return root;
}

async function runCalls(
  root: string,
  runId: string,
  calls: Array<{ name: string; arguments: unknown }>,
) {
  let turn = 0;
  return runProject(root, {
    runId,
    message: "Inspect artifact files",
    provider: {
      async *stream() {
        const call = calls[turn++];
        if (call) yield { type: "tool.call", call };
        else yield { type: "text", text: "Done" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
}

function toolResults(run: Awaited<ReturnType<typeof runProject>>) {
  return run.events
    .filter((event) => event.type === "tool.result")
    .map((event) => (event.type === "tool.result" ? event.payload.result : undefined));
}

it("paginates filtered artifact paths in stable order", async () => {
  const root = await scaffold();
  await writeFile(
    join(root, "tools", "seed.tool.ts"),
    `export default {
      name: "seed", description: "Seed files",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async (_input, { artifacts }) => {
        await artifacts.write("reports/c.md", "c");
        await artifacts.write("reports/a.md", "a");
        await artifacts.write("reports/b.md", "b");
      },
    };`,
  );
  const run = await runCalls(root, "provider-artifact-pagination", [
    { name: "seed", arguments: {} },
    { name: "list_files", arguments: { glob: "reports/*.md", limit: 2 } },
    { name: "list_files", arguments: { glob: "reports/*.md", limit: 2, offset: 2 } },
  ]);
  const results = toolResults(run);

  expect(run.status).toBe("completed");
  expect(results[1]).toMatchObject({
    files: [{ path: "reports/a.md" }, { path: "reports/b.md" }],
    offset: 0,
    nextOffset: 2,
  });
  expect(results[2]).toMatchObject({ files: [{ path: "reports/c.md" }], offset: 2 });
});

it("returns metadata without content when read_file sees a binary artifact", async () => {
  const root = await scaffold();
  await writeFile(
    join(root, "tools", "seed.tool.ts"),
    `export default {
      name: "seed", description: "Write a binary file",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async (_input, { artifacts }) => artifacts.write("reports/data.bin", Uint8Array.from([0, 255, 10])),
    };`,
  );
  const run = await runCalls(root, "provider-artifact-binary-read", [
    { name: "seed", arguments: {} },
    { name: "read_file", arguments: { path: "reports/data.bin" } },
  ]);
  const results = toolResults(run);

  expect(run.status).toBe("completed");
  expect(results[1]).toMatchObject({
    path: "reports/data.bin",
    binary: true,
    sizeBytes: 3,
    mimeType: "application/octet-stream",
    version: 1,
  });
  expect(results[1]).not.toHaveProperty("content");
});

it("keeps text read pages within the byte cap and provides the next line offset", async () => {
  const root = await scaffold();
  await writeFile(
    join(root, "tools", "seed.tool.ts"),
    `export default {
      name: "seed", description: "Write a long text artifact",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async (_input, { artifacts }) => artifacts.write("reports/long.txt", "a".repeat(20000) + "\\n" + "b".repeat(20000)),
    };`,
  );
  const run = await runCalls(root, "provider-artifact-read-pages", [
    { name: "seed", arguments: {} },
    { name: "read_file", arguments: { path: "reports/long.txt", limit: 2 } },
    { name: "read_file", arguments: { path: "reports/long.txt", offset: 2, limit: 2 } },
  ]);
  const results = toolResults(run);

  expect(run.status).toBe("completed");
  expect(results[1]).toMatchObject({ content: `${"a".repeat(20000)}\n`, offset: 1, nextOffset: 2 });
  expect(results[2]).toMatchObject({ content: "b".repeat(20000), offset: 2 });
});

it("allows replaceAll for an exact edit with several matches", async () => {
  const root = await scaffold();
  const run = await runCalls(root, "provider-artifact-edit-all", [
    { name: "write_file", arguments: { path: "report.txt", content: "draft draft" } },
    {
      name: "edit_file",
      arguments: { path: "report.txt", old: "draft", new: "final", replaceAll: true },
    },
  ]);
  const results = toolResults(run);
  const writes = run.events.filter((event) => event.type === "artifact.file.written");

  expect(run.status).toBe("completed");
  expect(results[1]).toEqual({ path: "report.txt", version: 2, replacementCount: 2 });
  expect(writes.at(-1)).toMatchObject({
    type: "artifact.file.written",
    payload: { content: "final final", version: 2 },
  });
});
