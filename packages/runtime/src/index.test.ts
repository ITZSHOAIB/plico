import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "@plico/core";
import { describe, expect, it, vi } from "vitest";
import {
  buildArtifactWorkspace,
  checkReadiness,
  createSqliteEventStore,
  discoverTools,
  type ModelProvider,
  runEvals,
  runProject,
} from "./index.js";

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

  it("persists a completed dry run and reads it back after reopening the SQLite store", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const result = await runProject(root, {
      runId: "run-test-001",
      eventStore,
    });

    expect(result.status).toBe("completed");
    expect(result.runId).toBe("run-test-001");

    expect(await eventStore.listRuns()).toEqual([
      expect.objectContaining({
        runId: "run-test-001",
        projectRoot: root,
        projectName: "Internal Ops Agent",
        status: "completed",
        output: "Dry run complete for Internal Ops Agent.",
        startedAt: expect.any(String),
        endedAt: expect.any(String),
      }),
    ]);

    expect(await eventStore.getRun("run-test-001")).toMatchObject({
      runId: "run-test-001",
      projectRoot: root,
      projectName: "Internal Ops Agent",
      status: "completed",
      output: "Dry run complete for Internal Ops Agent.",
    });

    expect(await eventStore.getEvents("run-test-001")).toEqual(
      result.events.map((event) =>
        expect.objectContaining({
          schemaVersion: 1,
          runId: "run-test-001",
          id: event.id,
          sequence: event.sequence,
          timestamp: event.timestamp,
          type: event.type,
          payload: event.payload,
        }),
      ),
    );

    const reopenedStore = createSqliteEventStore({ databasePath });
    expect(await reopenedStore.getRun("run-test-001")).toMatchObject({
      runId: "run-test-001",
      status: "completed",
    });
    expect(await reopenedStore.getEvents("run-test-001", { afterSequence: 3 })).toEqual([
      expect.objectContaining({
        sequence: 4,
        type: "assistant.output",
      }),
      expect.objectContaining({
        sequence: 5,
        type: "run.completed",
      }),
    ]);
  });

  it("generates unique default run IDs when no deterministic run ID is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const first = await runProject(root);
    const second = await runProject(root);

    expect(first.runId).not.toBe("run-0001");
    expect(second.runId).not.toBe("run-0001");
    expect(first.runId).not.toBe(second.runId);
  });

  it("persists a failed dry run and reads back its terminal events after reopening", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await symlink(join(root, "missing.md"), join(root, "skills", "broken.md"));

    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const result = await runProject(root, {
      runId: "run-test-002",
      eventStore,
    });

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "run.error",
      "run.failed",
    ]);

    expect(await eventStore.getRun("run-test-002")).toMatchObject({
      runId: "run-test-002",
      status: "failed",
      projectName: "Internal Ops Agent",
    });

    const reopenedStore = createSqliteEventStore({ databasePath });
    expect(await reopenedStore.listRuns()).toEqual([
      expect.objectContaining({
        runId: "run-test-002",
        status: "failed",
      }),
    ]);
    expect(await reopenedStore.getEvents("run-test-002", { afterSequence: 1 })).toEqual([
      expect.objectContaining({
        sequence: 2,
        type: "run.error",
      }),
      expect.objectContaining({
        sequence: 3,
        type: "run.failed",
      }),
    ]);
  });

  it("persists a blocked dry run and replays the approval sequence after reopening", async () => {
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
        "  handler: async () => ({ ok: true }),",
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const result = await runProject(root, {
      runId: "run-test-003",
      eventStore,
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

    const reopenedStore = createSqliteEventStore({ databasePath });
    expect(await reopenedStore.getRun("run-test-003")).toMatchObject({
      runId: "run-test-003",
      status: "blocked",
    });
    expect(await reopenedStore.getEvents("run-test-003", { afterSequence: 4 })).toEqual([
      expect.objectContaining({
        sequence: 5,
        type: "approval.required",
      }),
      expect.objectContaining({
        sequence: 6,
        type: "run.blocked",
      }),
    ]);
  });

  it("runs a valid project through a fake provider with a user message, emitting provider-neutral events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const fakeProvider: ModelProvider = {
      complete: async (request) => ({
        content: `Echo: ${request.messages[1]?.content ?? ""}`,
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    };

    const result = await runProject(root, {
      provider: fakeProvider,
      message: "Hello from user",
    });

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Echo: Hello from user");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "input.received",
      "model.request",
      "model.response",
      "assistant.output",
      "run.completed",
    ]);
    expect(result.events[3]?.payload).toMatchObject({
      content: "Hello from user",
    });
    expect(result.events[4]?.payload).toMatchObject({
      messages: expect.arrayContaining([expect.objectContaining({ content: expect.any(String) })]),
    });
    expect(result.events[5]?.payload).toMatchObject({
      content: "Echo: Hello from user",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("fails with clear diagnostics when provider is configured but no message is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const fakeProvider: ModelProvider = {
      complete: async () => ({ content: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    };

    const result = await runProject(root, { provider: fakeProvider });

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[3]?.payload).toMatchObject({
      phase: "provider",
      message: expect.stringContaining("message"),
    });
  });

  it("persists a provider-backed run and replays it through the event store", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const fakeProvider: ModelProvider = {
      complete: async (request) => ({
        content: `Reply: ${request.messages[1]?.content ?? ""}`,
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    };

    const result = await runProject(root, {
      runId: "run-provider-001",
      provider: fakeProvider,
      message: "Test message",
      eventStore,
    });

    expect(result.status).toBe("completed");

    const reopenedStore = createSqliteEventStore({ databasePath });
    expect(await reopenedStore.getRun("run-provider-001")).toMatchObject({
      runId: "run-provider-001",
      status: "completed",
    });
    const events = await reopenedStore.getEvents("run-provider-001");
    expect(events.some((e) => e.type === "model.request")).toBe(true);
    expect(events.some((e) => e.type === "model.response")).toBe(true);
  });

  it("executes a provider-requested declared TypeScript tool and delivers result back to the provider loop", async () => {
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

    let callCount = 0;
    const fakeProvider: ModelProvider = {
      complete: async (request) => {
        callCount++;
        if (callCount === 1) {
          return {
            content: "",
            usage: { inputTokens: 15, outputTokens: 2 },
            toolCalls: [{ name: "create_ticket", arguments: { title: "VPN down" } }],
          };
        }
        return {
          content: "Ticket created successfully.",
          usage: { inputTokens: 5, outputTokens: 4 },
        };
      },
    };

    const result = await runProject(root, {
      provider: fakeProvider,
      message: "Create a ticket for VPN down",
    });

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Ticket created successfully.");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "input.received",
      "model.request",
      "model.response",
      "tool.call",
      "tool.result",
      "model.request",
      "model.response",
      "assistant.output",
      "run.completed",
    ]);
    expect(result.events[6]?.payload).toMatchObject({
      toolName: "create_ticket",
      arguments: { title: "VPN down" },
    });
    expect(result.events[7]?.payload).toMatchObject({
      toolName: "create_ticket",
      result: { ticketId: "TCK-8" },
    });
    expect(callCount).toBe(2);
  });

  it("rejects provider-requested tool call with invalid arguments via native error event", async () => {
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
        '  handler: async () => { throw new Error("should not run"); },',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeProvider: ModelProvider = {
      complete: async () => ({
        content: "",
        usage: { inputTokens: 5, outputTokens: 1 },
        toolCalls: [{ name: "create_ticket", arguments: {} }],
      }),
    };

    const result = await runProject(root, {
      provider: fakeProvider,
      message: "Create a ticket",
    });

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "input.received",
      "model.request",
      "model.response",
      "tool.call",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[7]?.payload).toMatchObject({
      phase: "tool.validation",
      toolName: "create_ticket",
    });
  });

  it("emits native error events for provider-requested tool handler errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "failing.tool.ts"),
      [
        "export default {",
        '  name: "failing_tool",',
        '  description: "A tool that always fails.",',
        '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
        '  capabilities: ["test"],',
        "  approval: { required: false },",
        '  handler: async () => { throw new Error("tool crashed"); },',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeProvider: ModelProvider = {
      complete: async () => ({
        content: "",
        usage: { inputTokens: 5, outputTokens: 1 },
        toolCalls: [{ name: "failing_tool", arguments: {} }],
      }),
    };

    const result = await runProject(root, {
      provider: fakeProvider,
      message: "Run failing tool",
    });

    expect(result.status).toBe("failed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "input.received",
      "model.request",
      "model.response",
      "tool.call",
      "run.error",
      "run.failed",
    ]);
    expect(result.events[7]?.payload).toMatchObject({
      phase: "runtime",
      message: "tool crashed",
    });
  });

  it("blocks provider-requested approval-required tools without executing the handler", async () => {
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

    const fakeProvider: ModelProvider = {
      complete: async () => ({
        content: "",
        usage: { inputTokens: 5, outputTokens: 1 },
        toolCalls: [{ name: "delete_ticket", arguments: { ticketId: "TCK-1" } }],
      }),
    };

    const result = await runProject(root, {
      provider: fakeProvider,
      message: "Delete ticket",
    });

    expect(result.status).toBe("blocked");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "input.received",
      "model.request",
      "model.response",
      "tool.call",
      "approval.required",
      "run.blocked",
    ]);
  });

  it("persists provider-requested tool events and replays them through the event store", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "create-ticket.tool.ts"),
      [
        "export default {",
        '  name: "create_ticket",',
        '  description: "Create an internal support ticket.",',
        '  inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false },',
        '  capabilities: ["ticket:write"],',
        "  approval: { required: false },",
        '  handler: async (input) => ({ ticketId: "TCK-" + input.title.length }),',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const fakeProvider: ModelProvider = {
      complete: async (request) => {
        const hasToolResult = request.messages.some(
          (m) => m.role === "assistant" && m.content.includes("ticketId"),
        );
        if (hasToolResult) {
          return {
            content: "Done",
            usage: { inputTokens: 5, outputTokens: 3 },
          };
        }
        return {
          content: "",
          usage: { inputTokens: 10, outputTokens: 1 },
          toolCalls: [{ name: "create_ticket", arguments: { title: "Test" } }],
        };
      },
    };

    const result = await runProject(root, {
      runId: "run-provider-tool-001",
      provider: fakeProvider,
      message: "Create ticket",
      eventStore,
    });

    expect(result.status).toBe("completed");
    expect(result.events.some((e) => e.type === "tool.call")).toBe(true);
    expect(result.events.some((e) => e.type === "tool.result")).toBe(true);

    const reopenedStore = createSqliteEventStore({ databasePath });
    expect(await reopenedStore.getRun("run-provider-tool-001")).toMatchObject({
      runId: "run-provider-tool-001",
      status: "completed",
    });
    const events = await reopenedStore.getEvents("run-provider-tool-001");
    expect(events.some((e) => e.type === "tool.call")).toBe(true);
    expect(events.some((e) => e.type === "tool.result")).toBe(true);
  });

  it("preserves existing provider-free dry run behavior when no provider is given", async () => {
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

  it("passes composed instructions, project metadata, and cancellation signals to the fake provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    let capturedRequest: unknown;
    const fakeProvider: ModelProvider = {
      complete: async (request) => {
        capturedRequest = request;
        return {
          content: "response",
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    };

    const result = await runProject(root, {
      provider: fakeProvider,
      message: "Hello",
    });

    expect(result.status).toBe("completed");
    expect(capturedRequest).toMatchObject({
      messages: [
        { role: "system", content: expect.stringContaining("Internal Ops Agent") },
        { role: "user", content: "Hello" },
      ],
      maxSteps: 10,
    });
  });

  it("handles missing provider configuration with clear validation diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const result = await runProject(root, {
      // @ts-expect-error - intentionally testing missing provider config
      provider: undefined,
    });

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Dry run complete for Internal Ops Agent.");
  });

  it("produces artifact events from artifact.write script steps and reconstructs workspace from events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-runtime-"));
    await writeValidProject(root);

    const result = await runProject(root, {
      script: [
        {
          type: "artifact.write",
          files: [
            {
              path: "summary.md",
              content: "# Summary\n\nWork completed.",
              mimeType: "text/markdown",
            },
            { path: "output.json", content: '{"key": "value"}' },
          ],
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "artifact.workspace.created",
      "artifact.file.written",
      "artifact.file.written",
      "artifact.snapshot.created",
      "run.completed",
    ]);
    expect(result.output).toContain("Artifact workspace");

    const workspace = buildArtifactWorkspace(result.runId, result.events);
    expect(workspace).toBeDefined();
    expect(workspace?.files).toHaveLength(2);
    expect(workspace?.files[0]).toMatchObject({
      path: "summary.md",
      content: "# Summary\n\nWork completed.",
      mimeType: "text/markdown",
    });
    expect(workspace?.files[1]).toMatchObject({
      path: "output.json",
      content: '{"key": "value"}',
      mimeType: "text/plain",
    });
    expect(workspace?.snapshots).toHaveLength(1);
    expect(workspace?.snapshots[0]).toMatchObject({
      fileCount: 2,
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

describe("runEvals", () => {
  it("discovers and runs .script.json eval cases, returning pass/fail summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
    await writeValidProject(root);
    await mkdir(join(root, "evals"), { recursive: true });

    await writeFile(
      join(root, "evals", "passing.script.json"),
      JSON.stringify({
        name: "passing-eval",
        description: "A passing eval case.",
        script: [{ type: "assistant.output", content: "Hello from eval" }],
      }),
      "utf8",
    );

    const summary = await runEvals(root);

    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results[0]).toMatchObject({
      name: "passing-eval",
      status: "pass",
      runStatus: "completed",
      output: "Hello from eval",
    });
    expect(summary.results[0].runId).toContain("eval-passing-eval-");
  });

  it("reports failure when expect.status does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
    await writeValidProject(root);
    await mkdir(join(root, "evals"), { recursive: true });

    await writeFile(
      join(root, "evals", "failing.script.json"),
      JSON.stringify({
        name: "failing-eval",
        description: "A failing eval case.",
        script: [{ type: "assistant.output", content: "Will this fail?" }],
        expect: { status: "failed" },
      }),
      "utf8",
    );

    const summary = await runEvals(root);

    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.results[0]).toMatchObject({
      name: "failing-eval",
      status: "fail",
      runStatus: "completed",
    });
    expect(summary.results[0].diagnostics).toBeDefined();
    expect(summary.results[0].diagnostics?.[0]).toContain('Expected status "failed"');
  });

  it("reports failure when expect.outputContains does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
    await writeValidProject(root);
    await mkdir(join(root, "evals"), { recursive: true });

    await writeFile(
      join(root, "evals", "output-check.script.json"),
      JSON.stringify({
        name: "output-check",
        script: [{ type: "assistant.output", content: "Hello world" }],
        expect: { outputContains: "Goodbye" },
      }),
      "utf8",
    );

    const summary = await runEvals(root);

    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.results[0].diagnostics?.[0]).toContain('Expected output to contain "Goodbye"');
  });

  it("returns empty summary when evals directory has no .script.json files", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
    await writeValidProject(root);

    const summary = await runEvals(root);

    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.results).toEqual([]);
  });

  it("persists eval runs when eventStore is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
    await writeValidProject(root);
    await mkdir(join(root, "evals"), { recursive: true });

    await writeFile(
      join(root, "evals", "persisted.script.json"),
      JSON.stringify({
        name: "persisted-eval",
        script: [{ type: "assistant.output", content: "Persist me" }],
      }),
      "utf8",
    );

    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    const summary = await runEvals(root, { eventStore });

    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(1);

    const runs = await eventStore.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toContain("eval-persisted-eval-");
    expect(runs[0].status).toBe("completed");
  });

  it("runs multiple eval cases in deterministic sorted order", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
    await writeValidProject(root);
    await mkdir(join(root, "evals"), { recursive: true });

    await writeFile(
      join(root, "evals", "b-second.script.json"),
      JSON.stringify({
        name: "second-eval",
        script: [{ type: "assistant.output", content: "Second" }],
      }),
      "utf8",
    );
    await writeFile(
      join(root, "evals", "a-first.script.json"),
      JSON.stringify({
        name: "first-eval",
        script: [{ type: "assistant.output", content: "First" }],
      }),
      "utf8",
    );

    const summary = await runEvals(root);

    expect(summary.total).toBe(2);
    expect(summary.results[0].name).toBe("first-eval");
    expect(summary.results[1].name).toBe("second-eval");
  });
});

describe("checkReadiness", () => {
  it("returns ok diagnostics for a valid project", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);

    const report = await checkReadiness(root);

    expect(report.projectRoot).toBe(root);
    expect(report.timestamp).toBeDefined();
    expect(report.summary.error).toBe(0);
    expect(
      report.diagnostics.some((d) => d.subsystem === "project.structure" && d.severity === "ok"),
    ).toBe(true);
    expect(report.diagnostics.some((d) => d.subsystem === "tools.discovery")).toBe(true);
  });

  it("reports validation errors for an invalid project", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));

    const report = await checkReadiness(root);

    expect(report.summary.error).toBeGreaterThan(0);
    expect(
      report.diagnostics.some((d) => d.severity === "error" && d.subsystem === "project.structure"),
    ).toBe(true);
  });

  it("includes eval fixture and eval results diagnostics when eventStore has eval runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);
    await mkdir(join(root, "evals"), { recursive: true });
    await writeFile(
      join(root, "evals", "test.script.json"),
      JSON.stringify({
        name: "test-eval",
        script: [{ type: "assistant.output", content: "Hi" }],
      }),
      "utf8",
    );

    // Run an eval to produce persisted results
    const databasePath = join(root, ".plico", "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    await runEvals(root, { eventStore });

    const report = await checkReadiness(root, { databasePath, eventStore });

    expect(
      report.diagnostics.some((d) => d.subsystem === "evals.fixtures" && d.severity === "ok"),
    ).toBe(true);
    expect(
      report.diagnostics.some((d) => d.subsystem === "evals.results" && d.severity === "ok"),
    ).toBe(true);
    expect(report.diagnostics.some((d) => d.subsystem === "persistence.storage")).toBe(true);
  });

  it("reports per-tool schema errors for invalid tool files", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "bad.tool.ts"),
      [
        "export default {",
        '  name: "bad_tool",',
        "  description: 123,",
        '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
        '  capabilities: ["test"],',
        "  approval: { required: false },",
        "  handler: async () => ({}),",
        "} as const;",
      ].join("\n"),
      "utf8",
    );

    const report = await checkReadiness(root);

    expect(
      report.diagnostics.some((d) => d.subsystem === "tools.discovery" && d.severity === "error"),
    ).toBe(true);
    expect(report.diagnostics.some((d) => d.message.includes("bad.tool.ts"))).toBe(true);
  });

  it("reports ok for all-valid tool files", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "valid.tool.ts"),
      [
        "export default {",
        '  name: "valid_tool",',
        '  description: "A valid test tool.",',
        "  inputSchema: {",
        '    type: "object",',
        "    properties: {",
        '      msg: { type: "string" },',
        "    },",
        '    required: ["msg"],',
        "    additionalProperties: false,",
        "  },",
        '  capabilities: ["test:read"],',
        "  approval: { required: false },",
        "  handler: async () => ({}),",
        "} as const;",
      ].join("\n"),
      "utf8",
    );

    const report = await checkReadiness(root);

    const validDiag = report.diagnostics.find((d) => d.subsystem === "tools.discovery");
    expect(validDiag).toBeDefined();
    expect(validDiag?.message).toContain("1/1 tool(s) valid");
  });

  it("reports a warning when no eval fixtures exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);

    const report = await checkReadiness(root);

    expect(
      report.diagnostics.some((d) => d.subsystem === "evals.fixtures" && d.severity === "warning"),
    ).toBe(true);
  });

  it("includes artifact workspace and server config diagnostics for a valid project", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);

    const report = await checkReadiness(root);

    expect(report.diagnostics.some((d) => d.subsystem === "artifacts.workspace")).toBe(true);
    expect(report.diagnostics.some((d) => d.subsystem === "server.config")).toBe(true);
  });

  it("reports a warning when no provider configuration is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await writeValidProject(root);

    const report = await checkReadiness(root);

    expect(
      report.diagnostics.some((d) => d.subsystem === "provider.config" && d.severity === "warning"),
    ).toBe(true);
  });

  it("reports ok when provider configuration is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
    await mkdir(join(root, "skills"), { recursive: true });
    await mkdir(join(root, "tools"), { recursive: true });
    await mkdir(join(root, "evals"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await mkdir(join(root, "memory"), { recursive: true });
    vi.stubEnv("PLICO_OPENAI_API_KEY", "sk-test");
    await writeFile(
      join(root, "plico.config.ts"),
      [
        "export default {",
        "  schemaVersion: 1,",
        '  name: "Provider Agent",',
        "  provider: {",
        '    type: "openai",',
        '    model: "gpt-4o",',
        "  },",
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "agent.md"), "# Agent\n\nInstructions.\n", "utf8");

    const report = await checkReadiness(root);

    expect(
      report.diagnostics.some((d) => d.subsystem === "provider.config" && d.severity === "ok"),
    ).toBe(true);

    vi.unstubAllEnvs();
  });

  it("reports error when provider type is unsupported", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-readiness-"));
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
        '  name: "Bad Provider",',
        "  provider: {",
        '    type: "unknown-vendor",',
        "  },",
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "agent.md"), "# Agent\n\nInstructions.\n", "utf8");

    const report = await checkReadiness(root);

    expect(
      report.diagnostics.some((d) => d.subsystem === "provider.config" && d.severity === "error"),
    ).toBe(true);
  });
});
