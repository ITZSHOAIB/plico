import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "@plico/core";
import { describe, expect, it } from "vitest";
import { discoverTools, runProject } from "./index.js";

async function writeValidProject(root: string) {
  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "artifacts"), { recursive: true });
  await mkdir(join(root, "memory"), { recursive: true });

  await writeFile(
    join(root, "plico.config.ts"),
    [
      "export default {",
      "  schemaVersion: 1,",
      '  name: "Internal Ops Agent",',
      "} as const;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "agent.md"),
    [
      "# Internal Ops Agent",
      "",
      "Use the local Markdown instructions as the source of truth.",
      "",
    ].join("\n"),
    "utf8",
  );

  return loadProject(root);
}

describe("runProject", () => {
  it("completes a deterministic provider-free dry run for a valid project", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const result = await runProject(root);

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Dry run complete for Internal Ops Agent.");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "assistant.output",
      "run.completed",
    ]);
  });

  it("composes agent instructions before Markdown skills in sorted order", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(join(root, "skills", "triage.md"), "# Triage\n\nSort urgent work.", "utf8");
    await writeFile(join(root, "skills", "intake.md"), "# Intake\n\nCapture the request.", "utf8");
    await writeFile(join(root, "skills", "notes.txt"), "Not a skill.", "utf8");

    const result = await runProject(root);

    expect(
      result.events.find((event) => event.type === "instructions.composed")?.payload,
    ).toMatchObject({
      sources: ["agent.md", "skills/intake.md", "skills/triage.md"],
      content: [
        "# Internal Ops Agent",
        "",
        "Use the local Markdown instructions as the source of truth.",
        "",
        "# Intake",
        "",
        "Capture the request.",
        "",
        "# Triage",
        "",
        "Sort urgent work.",
      ].join("\n"),
    });
  });

  it("returns validation diagnostics and failed events before execution for invalid projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));

    const result = await runProject(root);

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual([
      expect.objectContaining({
        path: "plico.config.ts",
        message: "Missing required file: plico.config.ts",
        severity: "error",
      }),
    ]);
    expect(result.events.map((event) => event.type)).toEqual(["run.error", "run.failed"]);
    expect(result.events[0]?.payload).toMatchObject({
      phase: "validation",
      issues: [
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required file: plico.config.ts",
          severity: "error",
        }),
      ],
    });
  });

  it("records runtime failures as error and terminal failed events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await symlink(join(root, "missing.md"), join(root, "skills", "broken.md"));

    const result = await runProject(root);

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[1]?.payload).toMatchObject({
      phase: "runtime",
      message: expect.stringContaining("ENOENT"),
    });
    expect(result.events[2]?.payload).toMatchObject({
      phase: "runtime",
      status: "failed",
    });
  });

  it("returns versioned ordered events with unique identifiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const result = await runProject(root);

    expect(result.events).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        runId: result.runId,
        id: "evt-0001",
        sequence: 1,
        timestamp: expect.any(String),
      }),
      expect.objectContaining({
        schemaVersion: 1,
        runId: result.runId,
        id: "evt-0002",
        sequence: 2,
        timestamp: expect.any(String),
      }),
      expect.objectContaining({
        schemaVersion: 1,
        runId: result.runId,
        id: "evt-0003",
        sequence: 3,
        timestamp: expect.any(String),
      }),
      expect.objectContaining({
        schemaVersion: 1,
        runId: result.runId,
        id: "evt-0004",
        sequence: 4,
        timestamp: expect.any(String),
      }),
      expect.objectContaining({
        schemaVersion: 1,
        runId: result.runId,
        id: "evt-0005",
        sequence: 5,
        timestamp: expect.any(String),
      }),
    ]);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(result.events.length);
    expect(result.events.at(-1)?.type).toBe("run.completed");
  });

  it("fails with runtime diagnostics when an explicit tool module is malformed", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "broken.tool.ts"),
      [
        "export default {",
        '  name: "broken_tool",',
        '  description: "Missing a handler.",',
        '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
        "  capabilities: [],",
        "  approval: { required: false },",
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runProject(root);

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[2]?.payload).toMatchObject({
      phase: "runtime",
      message: "tools/broken.tool.ts handler must be a function",
    });
  });

  it("executes scripted safe tool calls and emits ordered call and result events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "create-ticket.tool.ts"),
      [
        "export default {",
        '  name: "create_ticket",',
        '  description: "Create an internal support ticket.",',
        "  inputSchema: {",
        '    type: "object",',
        "    properties: {",
        '      title: { type: "string" },',
        "    },",
        '    required: ["title"],',
        "    additionalProperties: false,",
        "  },",
        '  capabilities: ["ticket:write"],',
        "  approval: { required: false },",
        '  handler: async (input) => ({ ticketId: "TCK-" + input.title.length }),',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runProject(root, {
      script: [
        { type: "assistant.output", content: "I will create the ticket." },
        { type: "tool.call", toolName: "create_ticket", arguments: { title: "VPN down" } },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.output).toBe("I will create the ticket.");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "assistant.output",
      "tool.call",
      "tool.result",
      "run.completed",
    ]);
    expect(result.events[4]?.payload).toMatchObject({
      toolName: "create_ticket",
      arguments: { title: "VPN down" },
    });
    expect(result.events[5]?.payload).toMatchObject({
      toolName: "create_ticket",
      result: { ticketId: "TCK-8" },
    });
  });

  it("fails scripted tool calls before the handler runs when arguments do not match the schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "create-ticket.tool.ts"),
      [
        "export default {",
        '  name: "create_ticket",',
        '  description: "Create an internal support ticket.",',
        "  inputSchema: {",
        '    type: "object",',
        "    properties: {",
        '      title: { type: "string" },',
        "    },",
        '    required: ["title"],',
        "    additionalProperties: false,",
        "  },",
        '  capabilities: ["ticket:write"],',
        "  approval: { required: false },",
        '  handler: async () => { throw new Error("handler should not run"); },',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "create_ticket", arguments: {} }],
    });

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "tool.call",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[4]?.payload).toMatchObject({
      phase: "tool.validation",
      toolName: "create_ticket",
      message: "Tool create_ticket arguments invalid: missing required property title",
    });
  });

  it("blocks approval-required tool calls without invoking the handler", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "delete-ticket.tool.ts"),
      [
        "export default {",
        '  name: "delete_ticket",',
        '  description: "Delete an internal support ticket.",',
        "  inputSchema: {",
        '    type: "object",',
        "    properties: {",
        '      ticketId: { type: "string" },',
        "    },",
        '    required: ["ticketId"],',
        "    additionalProperties: false,",
        "  },",
        '  capabilities: ["ticket:delete"],',
        '  approval: { required: true, reason: "Deletes support records." },',
        '  handler: async () => { throw new Error("handler should not run"); },',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "delete_ticket", arguments: { ticketId: "TCK-1" } }],
    });

    expect(result.status).toBe("blocked");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "tool.call",
      "approval.required",
      "run.blocked",
    ]);
    expect(result.events[4]?.payload).toMatchObject({
      toolName: "delete_ticket",
      arguments: { ticketId: "TCK-1" },
      approval: { required: true, reason: "Deletes support records." },
    });
  });

  it("records tool handler errors as native error and terminal failed events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "create-ticket.tool.ts"),
      [
        "export default {",
        '  name: "create_ticket",',
        '  description: "Create an internal support ticket.",',
        '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
        '  capabilities: ["ticket:write"],',
        "  approval: { required: false },",
        '  handler: async () => { throw new Error("ticket system unavailable"); },',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "create_ticket", arguments: {} }],
    });

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "tool.call",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[4]?.payload).toMatchObject({
      phase: "runtime",
      message: "ticket system unavailable",
    });
  });
});

describe("discoverTools", () => {
  it("discovers default-exported tools from explicit .tool.ts modules and ignores other files", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    const project = await writeValidProject(root);
    await writeFile(
      join(root, "tools", "create-ticket.tool.ts"),
      [
        "export default {",
        '  name: "create_ticket",',
        '  description: "Create an internal support ticket.",',
        "  inputSchema: {",
        '    type: "object",',
        "    properties: {",
        '      title: { type: "string" },',
        "    },",
        '    required: ["title"],',
        "    additionalProperties: false,",
        "  },",
        '  capabilities: ["ticket:write"],',
        "  approval: { required: false },",
        '  handler: async (input) => ({ ticketId: "TCK-" + input.title.length }),',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "tools", "scratch.ts"),
      'throw new Error("non-tool files must not be imported");\n',
      "utf8",
    );

    const tools = await discoverTools(project);

    expect(tools.map((tool) => tool.name)).toEqual(["create_ticket"]);
    expect(tools[0]).toMatchObject({
      source: "tools/create-ticket.tool.ts",
      name: "create_ticket",
      description: "Create an internal support ticket.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      capabilities: ["ticket:write"],
      approval: { required: false },
    });
  });

  it("rejects tool names that are not stable identifiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    const project = await writeValidProject(root);
    await writeFile(
      join(root, "tools", "bad-name.tool.ts"),
      [
        "export default {",
        '  name: "Create Ticket!",',
        '  description: "Create an internal support ticket.",',
        '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
        "  capabilities: [],",
        "  approval: { required: false },",
        "  handler: async () => ({}),",
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(discoverTools(project)).rejects.toThrow(
      "tools/bad-name.tool.ts tool name must match /^[a-z][a-z0-9_]*$/",
    );
  });
});
