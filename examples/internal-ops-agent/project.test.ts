import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "../../packages/core/src/index.js";
import {
  buildArtifactWorkspace,
  createSqliteEventStore,
  runProject,
} from "../../packages/runtime/src/index.js";
import type { ModelRequest } from "../../packages/runtime/src/types/index.js";

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
      "artifact.workspace.created",
      "artifact.file.written",
      "run.completed",
    ]);
  });

  it("writes a ticket artifact during a provider run", async () => {
    let turn = 0;
    const requests: ModelRequest[] = [];
    const databasePath = join(
      await mkdtemp(join(tmpdir(), "plico-example-provider-artifact-")),
      "plico.sqlite",
    );
    const eventStore = createSqliteEventStore({ databasePath });
    const result = await runProject("examples/internal-ops-agent", {
      runId: "internal-ops-provider-artifact",
      message: "Create a ticket for VPN down",
      eventStore,
      provider: {
        async *stream(request) {
          requests.push(request);
          const callIndex = turn++;
          if (callIndex < 2) {
            yield {
              type: "tool.call",
              call: {
                id: `create-ticket-call-${callIndex}`,
                name: "create_ticket",
                arguments: { title: "VPN down" },
              },
            };
          } else {
            yield { type: "text", text: "Created ticket TCK-8 and saved its summary." };
          }
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(requests[0]?.tools?.map((tool) => tool.name)).toContain("create_ticket");
    const writes = result.events.filter((event) => event.type === "artifact.file.written");
    const ticketPaths = writes.map((event) =>
      event.type === "artifact.file.written" ? event.payload.path : "",
    );
    expect(ticketPaths).toHaveLength(2);
    expect(new Set(ticketPaths).size).toBe(2);
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "artifact.file.written",
          payload: expect.objectContaining({
            content: expect.stringContaining("VPN down"),
            mimeType: "text/markdown",
          }),
        }),
      ]),
    );
    const persistedEvents = await eventStore.getEvents(result.runId);
    const toolResultIndex = persistedEvents.findIndex((event) => event.type === "tool.result");
    const artifactWriteIndex = persistedEvents.findIndex(
      (event) => event.type === "artifact.file.written",
    );
    expect(artifactWriteIndex).toBeGreaterThan(toolResultIndex);
    expect(buildArtifactWorkspace(result.runId, persistedEvents)?.files).toMatchObject([
      { content: expect.stringContaining("VPN down") },
      { content: expect.stringContaining("VPN down") },
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
      expect.objectContaining({ sequence: 7, type: "artifact.workspace.created" }),
      expect.objectContaining({ sequence: 8, type: "artifact.file.written" }),
      expect.objectContaining({ sequence: 9, type: "run.completed" }),
    ]);
  });

  it("produces a persisted artifact workspace in a dry run with artifact.write", async () => {
    const result = await runProject("examples/internal-ops-agent", {
      script: [
        { type: "assistant.output", content: "Creating ticket and recording artifacts." },
        {
          type: "artifact.write",
          files: [
            {
              path: "ticket-summary.md",
              content: "# Ticket Created\n\nTitle: VPN down",
              mimeType: "text/markdown",
            },
          ],
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "assistant.output",
      "artifact.workspace.created",
      "artifact.file.written",
      "artifact.snapshot.created",
      "run.completed",
    ]);

    const workspace = buildArtifactWorkspace(result.runId, result.events);
    expect(workspace).toBeDefined();
    expect(workspace?.files).toHaveLength(1);
    expect(workspace?.snapshots).toMatchObject([{ fileCount: 1 }]);
    expect(workspace?.files.find((file) => file.path === "ticket-summary.md")).toMatchObject({
      path: "ticket-summary.md",
      mimeType: "text/markdown",
    });
    expect(result.output).toContain("Artifact workspace");
  });
});
