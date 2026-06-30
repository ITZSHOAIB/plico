import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runProject } from "./index.js";

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
    ]);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(result.events.length);
    expect(result.events.at(-1)?.type).toBe("run.completed");
  });
});
