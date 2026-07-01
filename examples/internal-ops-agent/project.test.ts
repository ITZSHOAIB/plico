import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "../../packages/core/src/index.js";
import { createSqliteEventStore, runProject } from "../../packages/runtime/src/index.js";

describe("internal-ops-agent example", () => {
  it("validates as a Plico project", async () => {
    const result = await validateProject("examples/internal-ops-agent");

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(
      await readFile(join("examples/internal-ops-agent", "memory", "README.md"), "utf8"),
    ).toContain("durable project notes");
    expect(
      await readFile(join("examples/internal-ops-agent", "artifacts", "README.md"), "utf8"),
    ).toContain("generated outputs");
  });

  it("completes a scripted dry run with the checked-in tool", async () => {
    const result = await runProject("examples/internal-ops-agent", {
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
  });

  it("persists the checked-in smoke run and replays stored events", async () => {
    const databasePath = join(await mkdtemp(join(tmpdir(), "plico-example-")), "plico.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });

    const result = await runProject("examples/internal-ops-agent", {
      eventStore,
      script: [
        { type: "assistant.output", content: "I will create the ticket." },
        { type: "tool.call", toolName: "create_ticket", arguments: { title: "VPN down" } },
      ],
    });

    expect(result.status).toBe("completed");
    expect(await eventStore.listRuns()).toEqual([
      expect.objectContaining({
        status: "completed",
        projectRoot: "examples/internal-ops-agent",
      }),
    ]);
    expect(await eventStore.getEvents(result.runId, { afterSequence: 3 })).toEqual([
      expect.objectContaining({ sequence: 4, type: "assistant.output" }),
      expect.objectContaining({ sequence: 5, type: "tool.call" }),
      expect.objectContaining({ sequence: 6, type: "tool.result" }),
      expect.objectContaining({ sequence: 7, type: "run.completed" }),
    ]);
  });
});
