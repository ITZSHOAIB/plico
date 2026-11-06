import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReadiness, createSqliteEventStore } from "../index.js";

async function scaffold(options: { tools?: boolean; config?: string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-readiness-unit-"));
  for (const dir of ["skills", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  if (options.tools !== false) await mkdir(join(root, "tools"), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    options.config ?? 'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  return root;
}

describe("checkReadiness", () => {
  it("reports a diagnostic instead of throwing when tools/ is missing", async () => {
    const root = await scaffold({ tools: false });

    const report = await checkReadiness(root);

    expect(report.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("does not create files or directories while checking", async () => {
    const root = await scaffold();
    const before = await readdir(root, { recursive: true });

    await checkReadiness(root);

    expect(await readdir(root, { recursive: true })).toEqual(before);
  });

  it("treats an attached event store as persistence being available", async () => {
    const root = await scaffold();
    const databasePath = join(root, "elsewhere.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const report = await checkReadiness(root, { eventStore });

    const persistence = report.diagnostics.filter((d) => d.subsystem === "persistence.storage");
    expect(persistence.map((d) => d.severity)).toEqual(["ok"]);
  });

  it("warns when approval policy refers to a tool that is not declared", async () => {
    const root = await scaffold({
      config:
        'export default { schemaVersion: 1, name: "Demo", approvals: { tools: { delelte_ticket: "required" } } } as const;\n',
    });

    const report = await checkReadiness(root);

    expect(report.diagnostics).toContainEqual({
      severity: "warning",
      subsystem: "approvals.policy",
      path: "plico.config.ts",
      message: 'Approval policy refers to undeclared tool "delelte_ticket".',
    });
  });

  it("warns when policy attempts to disable a tool-declared approval", async () => {
    const root = await scaffold({
      config:
        'export default { schemaVersion: 1, name: "Demo", approvals: { tools: { delete_ticket: "none" } } } as const;\n',
    });
    await writeFile(
      join(root, "tools", "delete-ticket.tool.ts"),
      'export default { name: "delete_ticket", description: "Delete a ticket", inputSchema: { type: "object" }, capabilities: ["ticket:delete"], approval: { required: true }, handler: async () => ({}) };\n',
    );

    const report = await checkReadiness(root);

    expect(report.diagnostics).toContainEqual({
      severity: "warning",
      subsystem: "approvals.policy",
      message:
        'Tool "delete_ticket" requires approval in its declaration; the "none" override has no effect.',
    });
  });

  it("does not report a policy target as undeclared when a tool fails to load", async () => {
    const root = await scaffold({
      config:
        'export default { schemaVersion: 1, name: "Demo", approvals: { tools: { broken_tool: "required" } } } as const;\n',
    });
    await writeFile(join(root, "tools", "broken.tool.ts"), "export default { name: ;\n");

    const report = await checkReadiness(root);
    const policy = report.diagnostics.filter(
      (diagnostic) => diagnostic.subsystem === "approvals.policy",
    );

    expect(policy.some((diagnostic) => diagnostic.message.includes("undeclared tool"))).toBe(false);
  });

  it("reports duplicate tool names with the same message as project validation", async () => {
    const root = await scaffold();
    const tool = (name: string) =>
      [
        "export default {",
        `  name: "${name}",`,
        '  description: "A test tool.",',
        '  inputSchema: { type: "object" },',
        "  capabilities: [],",
        "  approval: { required: false },",
        "  handler: async () => ({}),",
        "} as const;",
        "",
      ].join("\n");
    await writeFile(join(root, "tools", "a.tool.ts"), tool("lookup"));
    await writeFile(join(root, "tools", "b.tool.ts"), tool("lookup"));

    const report = await checkReadiness(root);

    expect(report.diagnostics).toContainEqual({
      severity: "error",
      subsystem: "tools.discovery",
      path: "tools/b.tool.ts",
      message: 'Duplicate tool name "lookup" declared in tools/a.tool.ts and tools/b.tool.ts',
    });
  });
});
