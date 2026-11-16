import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createSqliteEventStore, type ModelRequest, runProject } from "../index.js";
import {
  outputProject as scaffold,
  outputSchema as schema,
  outputUsage as usage,
} from "../testing/structured-output.js";

it("validates a submitted result and records it on the final event", async () => {
  const root = await scaffold();
  const store = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
  const requests: ModelRequest[] = [];
  const result = await runProject(root, {
    message: "Triage this ticket",
    eventStore: store,
    provider: {
      async *stream(request) {
        requests.push(structuredClone(request));
        yield {
          type: "tool.call",
          call: { id: "result", name: "submit_result", arguments: { result: { ticket: "T-1" } } },
        };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: { ticket: "T-1" } });
  expect(requests[0]?.tools).toContainEqual(
    expect.objectContaining({
      name: "submit_result",
      inputSchema: {
        type: "object",
        properties: { result: schema },
        required: ["result"],
        additionalProperties: false,
      },
    }),
  );
  expect((await store.getEvents(result.runId)).at(-1)).toMatchObject({
    type: "run.completed",
    payload: { structuredOutput: { ticket: "T-1" } },
  });
});

it("gives an invalid submitted result one repair turn with the schema diagnostic", async () => {
  const root = await scaffold();
  const requests: ModelRequest[] = [];
  const result = await runProject(root, {
    message: "Triage this ticket",
    provider: {
      async *stream(request) {
        requests.push(structuredClone(request));
        yield {
          type: "tool.call",
          call: {
            id: "result",
            name: "submit_result",
            arguments: { result: { ticket: requests.length === 1 ? 7 : "T-1" } },
          },
        };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: { ticket: "T-1" } });
  expect(requests).toHaveLength(2);
  expect(requests[1]?.messages.at(-1)).toMatchObject({
    role: "tool",
    toolName: "submit_result",
    toolCallId: "result",
    content: expect.stringContaining("ticket: expected string"),
  });
});

it("fails after one repair when a provider never submits a structured result", async () => {
  const root = await scaffold();
  const requests: ModelRequest[] = [];
  const result = await runProject(root, {
    message: "Triage this ticket",
    provider: {
      async *stream(request) {
        requests.push(structuredClone(request));
        yield { type: "text", text: "The ticket is T-1." };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result.status).toBe("failed");
  expect(result).not.toHaveProperty("structuredOutput");
  expect(result.events.some((event) => event.type === "run.completed")).toBe(false);
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    phase: "output.validation",
    message: expect.stringContaining("submit_result"),
  });
  expect(requests).toHaveLength(2);
  expect(requests[1]?.messages.at(-1)?.content).toContain("submit_result");
});

it("fails after the single repair if submitted output still violates the schema", async () => {
  const root = await scaffold();
  let turns = 0;
  const result = await runProject(root, {
    message: "Triage",
    provider: {
      async *stream() {
        turns++;
        yield {
          type: "tool.call",
          call: { name: "submit_result", arguments: { result: { ticket: 7 } } },
        };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result.status).toBe("failed");
  expect(turns).toBe(2);
  expect(result).not.toHaveProperty("structuredOutput");
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    phase: "output.validation",
    message: expect.stringContaining("ticket: expected string"),
  });
});

it("rejects a project tool that conflicts with the structured result tool", async () => {
  const root = await scaffold();
  await writeFile(
    join(root, "tools", "submit.tool.ts"),
    'export default { name: "submit_result", description: "User tool", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => "wrong" };',
  );
  let called = false;
  const result = await runProject(root, {
    message: "Triage",
    provider: {
      async *stream() {
        called = true;
        yield {
          type: "tool.call",
          call: { name: "submit_result", arguments: { result: { ticket: "T-1" } } },
        };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result.status).toBe("failed");
  expect(called).toBe(false);
  expect(result.events.find((event) => event.type === "run.error")?.payload.message).toContain(
    "submit_result",
  );
});
