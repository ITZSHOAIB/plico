import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runProject } from "../index.js";

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-idempotency-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(
    join(root, "tools", "charge.tool.ts"),
    [
      "export default {",
      '  name: "charge", description: "Charge a card.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      "  capabilities: [], approval: { required: false },",
      "  handler: async (_input: unknown, context: { idempotencyKey: string }) => context.idempotencyKey,",
      "} as const;",
    ].join("\n"),
  );
  return root;
}

function toolResults(events: Array<{ type: string; payload: unknown }>): unknown[] {
  return events
    .filter((event) => event.type === "tool.result")
    .map((event) => (event.payload as { result: unknown }).result);
}

describe("tool idempotency keys", () => {
  it("derives the key from the run and the step in a scripted run", async () => {
    const root = await scaffold();

    const result = await runProject(root, {
      runId: "run-1",
      script: [
        { type: "tool.call", toolName: "charge", arguments: {} },
        { type: "tool.call", toolName: "charge", arguments: {} },
      ],
    });

    expect(toolResults(result.events)).toEqual(["run-1:0", "run-1:1"]);
  });

  it("derives the key from run, turn and call index with a provider", async () => {
    const root = await scaffold();
    let turn = 0;

    const result = await runProject(root, {
      runId: "run-1",
      message: "go",
      provider: {
        async *stream() {
          turn += 1;
          if (turn === 1) {
            yield { type: "tool.call", call: { name: "charge", arguments: {} } };
            yield { type: "tool.call", call: { name: "charge", arguments: {} } };
          } else {
            yield { type: "text", text: "done" };
          }
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });

    expect(toolResults(result.events)).toEqual(["run-1:0:0", "run-1:0:1"]);
  });
});
