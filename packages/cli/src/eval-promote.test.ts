import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, runProject } from "@plico/runtime";
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

    const written = JSON.parse(await readFile(join(root, "evals", "vpn.script.json"), "utf8"));
    expect(written).toEqual({
      name: "vpn",
      script: [
        { type: "tool.call", toolName: "lookup", arguments: { q: "vpn" }, result: { found: true } },
        { type: "assistant.output", content: "Found it" },
      ],
      expect: { status: "completed", outputContains: "Found it" },
    });
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
});
