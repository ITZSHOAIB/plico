import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateProject } from "@plico-ai/core";
import { createSqliteEventStore, runProject } from "@plico-ai/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function projectWithRun(): Promise<{ root: string; runId: string }> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-promote-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    'export default { name: "lookup", description: "Look up", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => ({ found: true }) };',
  );
  const eventStore = createSqliteEventStore({
    databasePath: join(root, ".plico", "plico.sqlite"),
  });
  const result = await runProject(root, {
    eventStore,
    script: [
      { type: "tool.call", toolName: "lookup", arguments: { q: "vpn" } },
      { type: "assistant.output", content: "Found it" },
    ],
  });
  return { root, runId: result.runId };
}

describe("plico eval --from-run", () => {
  it("writes a stored run as an eval case with its tool output recorded as the mock", async () => {
    const { root, runId } = await projectWithRun();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", "--from-run", runId, "--name", "vpn", root])).toBe(
      0,
    );

    const fixture = JSON.parse(await readFile(join(root, "evals", "vpn.script.json"), "utf8"));
    expect(fixture).toEqual([
      { type: "tool.call", toolName: "lookup", arguments: { q: "vpn" }, result: { found: true } },
      { type: "assistant.output", content: "Found it" },
    ]);
    expect(await readFile(join(root, "evals", "vpn.md"), "utf8")).toBe(
      "---\nexpect:\n  status: completed\n  contains: Found it\n---\n",
    );
    expect((await validateProject(root)).warnings).toEqual([]);
    expect(await main(["node", "plico", "eval", root])).toBe(0);
  });

  it("writes structured output fields under expect.output", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-promote-output-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir), { recursive: true });
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        schemaVersion: 1,
        name: "Demo",
        output: { type: "object", properties: { priority: { type: "string" } } },
      })};`,
    );
    await writeFile(join(root, "agent.md"), "# Demo\n");
    const { runId } = await runProject(root, {
      eventStore: createSqliteEventStore({ databasePath: join(root, ".plico", "plico.sqlite") }),
      script: [{ type: "assistant.output", content: '{"priority":"high"}' }],
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", "--from-run", runId, "--name", "p", root])).toBe(0);

    expect(await readFile(join(root, "evals", "p.md"), "utf8")).toBe(
      "---\nexpect:\n  status: completed\n  output:\n    priority: high\n---\n",
    );
    expect(await main(["node", "plico", "eval", root])).toBe(0);
  });

  it("refuses to overwrite an existing case and reports an unknown run", async () => {
    const { root, runId } = await projectWithRun();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await main(["node", "plico", "eval", "--from-run", runId, "--name", "vpn", root]);

    expect(await main(["node", "plico", "eval", "--from-run", runId, "--name", "vpn", root])).toBe(
      1,
    );
    expect(String(error.mock.calls.at(-1)?.[0])).toContain("already exists");
    expect(await main(["node", "plico", "eval", "--from-run", "run-missing", root])).toBe(1);
    expect(String(error.mock.calls.at(-1)?.[0])).toContain("run-missing");
  });

  it("rejects a case name that would leave the evals folder", async () => {
    const { root, runId } = await projectWithRun();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    for (const name of ["../escaped", "..", "a/b", "a\\b", "."]) {
      expect(
        await main(["node", "plico", "eval", "--from-run", runId, "--name", name, root]),
        name,
      ).toBe(1);
      expect(String(error.mock.calls.at(-1)?.[0])).toContain("--name");
    }
    expect(existsSync(join(root, "escaped.script.json"))).toBe(false);
    expect(await readdir(join(root, "evals"))).toEqual([]);
  });
});
