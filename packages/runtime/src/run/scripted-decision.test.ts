import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeScript, runProject } from "../index.js";

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-decide-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    [
      "export default {",
      '  name: "archive", description: "Archive a record.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      '  capabilities: [], approval: { required: true, reason: "Archiving is permanent." },',
      '  handler: async () => "archived",',
      "} as const;",
    ].join("\n"),
  );
  return root;
}

const call = { type: "tool.call" as const, toolName: "archive", arguments: {}, result: "done" };

describe("approval.decide script steps", () => {
  it("approves the gated tool call and carries on", async () => {
    const root = await project();

    const result = await runProject(root, {
      mockTools: true,
      script: [
        call,
        { type: "approval.decide", approved: true },
        { type: "assistant.output", content: "Archived." },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Archived.");
    const types = result.events.map((event) => event.type);
    expect(types).toContain("approval.requested");
    expect(types).toContain("approval.decided");
    expect(types).not.toContain("run.waiting");
    expect(types.indexOf("approval.decided")).toBeLessThan(types.indexOf("tool.result"));
  });

  it("denies the gated tool call and fails the run before the tool runs", async () => {
    const root = await project();

    const result = await runProject(root, {
      mockTools: true,
      script: [call, { type: "approval.decide", approved: false }],
    });

    expect(result.status).toBe("failed");
    const types = result.events.map((event) => event.type);
    expect(types).toContain("approval.decided");
    expect(types).not.toContain("tool.result");
  });

  it("still waits when no decide step follows", async () => {
    const root = await project();

    const result = await runProject(root, { mockTools: true, script: [call] });

    expect(result.status).toBe("waiting");
  });

  it("rejects a decide step that does not follow a gated tool call", async () => {
    const root = await project();

    const result = await runProject(root, {
      mockTools: true,
      script: [{ type: "approval.decide", approved: true }],
    });

    expect(result.status).toBe("failed");
  });

  it("requires approved to be a boolean", () => {
    expect(() => normalizeScript([{ type: "approval.decide" }])).toThrow(/approved/);
  });
});
