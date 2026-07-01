import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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
      "# Agent",
      "",
      "This project is organized file-first.",
      "",
      "Use the local Markdown instructions as the source of truth.",
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("main", () => {
  it("emits JSON for validate --json", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", "--json", root]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      issues: [],
      errors: [],
      warnings: [],
      project: {
        root,
        configPath: join(root, "plico.config.ts"),
        config: {
          schemaVersion: 1,
          name: "Internal Ops Agent",
        },
      },
    });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("validates a project successfully", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(`Valid Plico project: ${root}`);
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports validation failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "plico.config.ts: Missing required file: plico.config.ts",
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Valid Plico project"));

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("emits JSON for failed validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", "--json", root]);

    expect(exitCode).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required file: plico.config.ts",
          severity: "error",
        }),
      ]),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required file: plico.config.ts",
          severity: "error",
        }),
      ]),
      warnings: [],
    });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints warnings without treating them as failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    await writeFile(join(root, "agent.md"), "# Agent\n\nFollow the project instructions.", "utf8");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith("agent.md: agent.md looks like placeholder content");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(`Valid Plico project: ${root}`);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("runs a dry runtime for a valid project", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", root]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map(([line]) => String(line))).toEqual([
      `Running dry runtime for ${root}`,
      "run.started: Internal Ops Agent",
      "instructions.composed: 1 source(s)",
      "tools.discovered: 0 tool(s)",
      "assistant.output: Dry run complete for Internal Ops Agent.",
      "run.completed: completed",
    ]);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("emits JSON for dry run --json", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", "--json", root]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      runId: expect.any(String),
      status: "completed",
      output: "Dry run complete for Internal Ops Agent.",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "run.started",
        }),
        expect.objectContaining({
          type: "instructions.composed",
        }),
        expect.objectContaining({
          type: "tools.discovered",
        }),
        expect.objectContaining({
          type: "assistant.output",
        }),
        expect.objectContaining({
          type: "run.completed",
        }),
      ]),
    });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("persists a dry run to the default local database and prints the run ID", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", "--persist", root]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map(([line]) => String(line))).toEqual([
      `Running dry runtime for ${root}`,
      "run.started: Internal Ops Agent",
      "instructions.composed: 1 source(s)",
      "tools.discovered: 0 tool(s)",
      "assistant.output: Dry run complete for Internal Ops Agent.",
      "run.completed: completed",
      expect.stringMatching(/^Persisted run ID: run-/),
    ]);
    await expect(
      access(join(root, ".plico", "plico.sqlite"), fsConstants.F_OK),
    ).resolves.toBeUndefined();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("lists persisted runs and replays later events from the default local database", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const runLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const runExitCode = await main(["node", "plico", "run", "--dry", "--persist", "--json", root]);
    const persistedRun = JSON.parse(String(runLogSpy.mock.calls[0]?.[0])) as { runId: string };

    expect(runExitCode).toBe(0);
    expect(persistedRun.runId).toMatch(/^run-/);

    runLogSpy.mockRestore();

    const runsLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runsExitCode = await main(["node", "plico", "runs", root]);

    expect(runsExitCode).toBe(0);
    expect(runsLogSpy.mock.calls.map(([line]) => String(line))).toEqual([
      `Persisted runs for ${root} (${join(root, ".plico", "plico.sqlite")})`,
      expect.stringContaining(persistedRun.runId),
    ]);

    runsLogSpy.mockRestore();

    const eventsLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const eventsExitCode = await main([
      "node",
      "plico",
      "events",
      persistedRun.runId,
      "--after",
      "3",
      root,
    ]);

    expect(eventsExitCode).toBe(0);
    expect(eventsLogSpy.mock.calls.map(([line]) => String(line))).toEqual([
      `Events for ${persistedRun.runId}`,
      expect.stringMatching(/^4 assistant\.output /),
      expect.stringMatching(/^5 run\.completed /),
    ]);
    expect(errorSpy).not.toHaveBeenCalled();

    eventsLogSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("honors --db for persisted runs, runs, and events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const databasePath = join(root, "state", "custom.sqlite");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const runExitCode = await main([
      "node",
      "plico",
      "run",
      "--dry",
      "--persist",
      "--db",
      databasePath,
      "--json",
      root,
    ]);

    expect(runExitCode).toBe(0);
    const persistedRun = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { runId: string };
    expect(persistedRun.runId).toMatch(/^run-/);
    expect(await access(databasePath, fsConstants.F_OK)).toBeUndefined();
    await expect(access(join(root, ".plico", "plico.sqlite"), fsConstants.F_OK)).rejects.toThrow();

    logSpy.mockRestore();

    const runsLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runsExitCode = await main([
      "node",
      "plico",
      "runs",
      "--db",
      databasePath,
      "--json",
      root,
    ]);

    expect(runsExitCode).toBe(0);
    expect(JSON.parse(String(runsLogSpy.mock.calls[0]?.[0]))).toEqual([
      expect.objectContaining({
        runId: persistedRun.runId,
        status: "completed",
      }),
    ]);

    runsLogSpy.mockRestore();

    const eventsLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const eventsExitCode = await main([
      "node",
      "plico",
      "events",
      persistedRun.runId,
      "--db",
      databasePath,
      "--json",
      root,
    ]);

    expect(eventsExitCode).toBe(0);
    expect(JSON.parse(String(eventsLogSpy.mock.calls[0]?.[0]))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run.completed",
        }),
      ]),
    );
    expect(errorSpy).not.toHaveBeenCalled();

    eventsLogSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("runs a scripted dry runtime from a JSON file", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
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

    const scriptPath = join(root, "dry-run.script.json");
    await writeFile(
      scriptPath,
      JSON.stringify(
        [
          { type: "assistant.output", content: "I will create the ticket." },
          { type: "tool.call", toolName: "create_ticket", arguments: { title: "VPN down" } },
        ],
        null,
        2,
      ),
      "utf8",
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", "--script", scriptPath, root]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map(([line]) => String(line))).toEqual([
      `Running dry runtime for ${root}`,
      "run.started: Internal Ops Agent",
      "instructions.composed: 1 source(s)",
      "tools.discovered: 1 tool(s)",
      "assistant.output: I will create the ticket.",
      "tool.call: create_ticket",
      "tool.result: create_ticket",
      "run.completed: completed",
    ]);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports validation diagnostics for invalid dry runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", root]);

    expect(exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("run.started"));
    expect(errorSpy).toHaveBeenCalledWith(
      "plico.config.ts: Missing required file: plico.config.ts",
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports approval-blocked dry runs as failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "delete-ticket.tool.ts"),
      [
        "export default {",
        '  name: "delete_ticket",',
        '  description: "Delete an internal support ticket.",',
        '  inputSchema: { type: "object", properties: { ticketId: { type: "string" } }, required: ["ticketId"], additionalProperties: false },',
        '  capabilities: ["ticket:delete"],',
        '  approval: { required: true, reason: "Deletes support records." },',
        "  handler: async () => ({ ok: true }),",
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );
    const scriptPath = join(root, "blocked.script.json");
    await writeFile(
      scriptPath,
      JSON.stringify(
        [{ type: "tool.call", toolName: "delete_ticket", arguments: { ticketId: "TCK-1" } }],
        null,
        2,
      ),
      "utf8",
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", "--script", scriptPath, root]);

    expect(exitCode).toBe(1);
    expect(errorSpy.mock.calls.map(([line]) => String(line))).toEqual([
      `Running dry runtime for ${root}`,
      "run.started: Internal Ops Agent",
      "instructions.composed: 1 source(s)",
      "tools.discovered: 1 tool(s)",
      "tool.call: delete_ticket",
      "approval.required: delete_ticket",
      "run.blocked: approval required",
      "Dry run blocked.",
    ]);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("run.completed"));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports malformed dry-run scripts as actionable failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const scriptPath = join(root, "broken.script.json");
    await writeFile(scriptPath, "{ not json", "utf8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", "--script", scriptPath, root]);

    expect(exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("run.started"));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Unable to parse dry run script ${scriptPath}`),
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports missing databases, malformed cursors, and unknown run IDs", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const runsExitCode = await main(["node", "plico", "runs", root]);
    expect(runsExitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      `Missing database: ${join(root, ".plico", "plico.sqlite")}`,
    );

    const persistedRunExitCode = await main(["node", "plico", "run", "--dry", "--persist", root]);
    expect(persistedRunExitCode).toBe(0);
    const persistedRun = String(logSpy.mock.calls.at(-1)?.[0]).replace("Persisted run ID: ", "");

    logSpy.mockClear();
    errorSpy.mockClear();

    const eventsCursorExitCode = await main([
      "node",
      "plico",
      "events",
      persistedRun,
      "--after",
      "nope",
      root,
    ]);

    expect(eventsCursorExitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("Malformed cursor: nope");

    errorSpy.mockClear();

    const unknownRunExitCode = await main(["node", "plico", "events", "run-does-not-exist", root]);

    expect(unknownRunExitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("Unknown run ID: run-does-not-exist");
    expect(logSpy).not.toHaveBeenCalled();

    expect(persistedRun).toMatch(/^run-/);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
