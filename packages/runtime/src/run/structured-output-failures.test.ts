import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { type ModelRequest, runProject } from "../index.js";
import { outputProject, outputUsage as usage } from "../testing/structured-output.js";

it.each([
  undefined,
  "not JSON",
  '{"ticket":7}',
])("refuses invalid scripted output: %s", async (content) => {
  const root = await outputProject();
  const result = await runProject(root, {
    script: content === undefined ? [] : [{ type: "assistant.output", content }],
  });

  expect(result.status).toBe("failed");
  expect(result).not.toHaveProperty("structuredOutput");
  expect(result.events.at(-1)?.type).toBe("run.failed");
  expect(result.events.find((event) => event.type === "run.error")?.payload.phase).toBe(
    "output.validation",
  );
});

it("does not exceed maxSteps to repair an invalid result", async () => {
  const root = await outputProject();
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test", maxSteps: 1 }, output: { type: "string" } };',
  );
  let turns = 0;
  const result = await runProject(root, {
    message: "Triage",
    provider: {
      async *stream() {
        turns++;
        yield { type: "tool.call", call: { name: "submit_result", arguments: { result: 7 } } };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result.status).toBe("failed");
  expect(turns).toBe(1);
  expect(result.events.find((event) => event.type === "run.error")?.payload.phase).toBe(
    "output.validation",
  );
});

it("requires the final submission to be the only call in its turn", async () => {
  const root = await outputProject();
  const requests: ModelRequest[] = [];
  const result = await runProject(root, {
    message: "Triage",
    provider: {
      async *stream(request) {
        requests.push(structuredClone(request));
        yield {
          type: "tool.call",
          call: { id: "r", name: "submit_result", arguments: { result: { ticket: "T-1" } } },
        };
        if (requests.length === 1)
          yield { type: "tool.call", call: { id: "a", name: "other_tool", arguments: {} } };
        yield { type: "finish", usage };
      },
    },
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: { ticket: "T-1" } });
  expect(requests).toHaveLength(2);
  expect(requests[1]?.messages.filter((message) => message.role === "tool")).toHaveLength(2);
  expect(requests[1]?.messages.at(-1)?.content).toContain("alone");
});

it("uses the frontmatter output schema ahead of config", async () => {
  const root = await outputProject({ type: "number" });
  await writeFile(join(root, "agent.md"), "---\noutput:\n  type: string\n---\nReturn a string.\n");
  const result = await runProject(root, {
    script: [{ type: "assistant.output", content: '"T-1"' }],
  });

  expect(result).toMatchObject({ status: "completed", structuredOutput: "T-1" });
});
