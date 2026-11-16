import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type ModelRequest,
  runProject,
} from "../index.js";
import { outputProject, outputSchema, outputUsage } from "../testing/structured-output.js";

it.each([
  "T-1",
  7,
])("keeps the output schema and spent repair turn across approval: %s", async (ticket) => {
  const root = await outputProject();
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    'export default { name: "archive", description: "Archive", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => "archived" };',
  );
  const databasePath = join(root, "state.sqlite");
  const engine = createSqliteEngine({ databasePath });
  const store = createSqliteEventStore({ databasePath });
  const requests: ModelRequest[] = [];
  const run = await runProject(root, {
    message: "Triage",
    engine,
    eventStore: store,
    provider: {
      async *stream(request) {
        requests.push(structuredClone(request));
        if (requests.length === 2)
          yield { type: "tool.call", call: { id: "a", name: "archive", arguments: {} } };
        else
          yield {
            type: "tool.call",
            call: {
              id: "r",
              name: "submit_result",
              arguments: { result: { ticket: requests.length === 1 ? 7 : ticket } },
            },
          };
        yield { type: "finish", usage: outputUsage };
      },
    },
  });
  expect(run.status).toBe("waiting");

  // A live edit must not change what the waiting run is allowed to return.
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", output: { type: "number" } };',
  );
  await writeFile(join(root, "agent.md"), "---\noutput:\n  type: number\n---\nEdited\n");
  await engine.signal(run.runId, `approval:${run.runId}:1:0`, { approved: true });
  await vi.waitFor(
    async () => {
      expect((await store.getRun(run.runId))?.status).toBe(
        typeof ticket === "string" ? "completed" : "failed",
      );
    },
    { timeout: 10_000 },
  );

  expect(requests).toHaveLength(3);
  expect(
    requests[2]?.tools?.find((tool) => tool.name === "submit_result")?.inputSchema,
  ).toMatchObject({ properties: { result: outputSchema } });
  const events = await store.getEvents(run.runId);
  if (typeof ticket === "string")
    expect(events.at(-1)).toMatchObject({
      type: "run.completed",
      payload: { structuredOutput: { ticket: "T-1" } },
    });
  else
    expect(events.find((event) => event.type === "run.error")?.payload).toMatchObject({
      phase: "output.validation",
    });
});
