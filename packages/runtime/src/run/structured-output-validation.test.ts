import { expect, it } from "vitest";
import { checkReadiness, type ModelRequest, runProject } from "../index.js";
import {
  outputProject as scaffold,
  outputSchema as schema,
  outputUsage as usage,
} from "../testing/structured-output.js";

it("requests native structured output and validates the returned JSON", async () => {
  const root = await scaffold();
  const requests: ModelRequest[] = [];
  const result = await runProject(root, {
    message: "Triage this ticket",
    provider: {
      supportsStructuredOutput: true,
      async *stream(request) {
        requests.push(structuredClone(request));
        yield { type: "text", text: '{"ticket":"T-2"}' };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: { ticket: "T-2" } });
  expect(requests[0]).toMatchObject({ outputSchema: schema });
  expect(requests[0]?.tools?.some((tool) => tool.name === "submit_result")).toBe(false);
});

it("preserves null as a validated result through the fallback tool", async () => {
  const root = await scaffold({ type: "null" });
  const result = await runProject(root, {
    message: "Return null",
    provider: {
      async *stream() {
        yield { type: "tool.call", call: { name: "submit_result", arguments: { result: null } } };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: null, output: "null" });
  expect(result.events.at(-1)).toMatchObject({ payload: { structuredOutput: null } });
});

it.each(['{"ticket":7}', "not JSON"])("rejects invalid native output: %s", async (text) => {
  const root = await scaffold();
  const result = await runProject(root, {
    message: "Triage",
    provider: {
      supportsStructuredOutput: true,
      async *stream() {
        yield { type: "text", text };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result.status).toBe("failed");
  expect(result).not.toHaveProperty("structuredOutput");
  expect(
    result.events.some(
      (event) => event.type === "assistant.output" || event.type === "run.completed",
    ),
  ).toBe(false);
  expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
    phase: "output.validation",
  });
});

it("validates structured output in a scripted run too", async () => {
  const root = await scaffold();
  const result = await runProject(root, {
    script: [{ type: "assistant.output", content: '{"ticket":"T-3"}' }],
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: { ticket: "T-3" } });
  expect(result.events.at(-1)).toMatchObject({ payload: { structuredOutput: { ticket: "T-3" } } });
});

it("reports declared structured output in readiness", async () => {
  const root = await scaffold();
  const readiness = await checkReadiness(root);

  expect(readiness.diagnostics).toContainEqual(
    expect.objectContaining({
      subsystem: "run.output",
      severity: "ok",
      message: expect.stringContaining("validated"),
    }),
  );
});

it("uses the result tool for non-object schemas even with a native provider", async () => {
  const root = await scaffold({ type: "array", items: { type: "string" } });
  const requests: ModelRequest[] = [];
  const result = await runProject(root, {
    message: "List tickets",
    provider: {
      supportsStructuredOutput: true,
      async *stream(request) {
        requests.push(structuredClone(request));
        yield {
          type: "tool.call",
          call: { name: "submit_result", arguments: { result: ["T-1"] } },
        };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: ["T-1"] });
  expect(requests[0]).not.toHaveProperty("outputSchema");
  expect(requests[0]?.tools?.some((tool) => tool.name === "submit_result")).toBe(true);
});
