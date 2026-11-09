import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type ModelProvider,
  type ModelRequest,
  runProject,
} from "../index.js";

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-pinning-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Original instructions\n");
  await mkdir(join(root, "skills", "triage"));
  await writeFile(
    join(root, "skills", "triage", "SKILL.md"),
    "---\ndescription: Original skill.\n---\nOriginal skill body.",
  );
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    [
      "export default {",
      '  name: "archive", description: "Archive a record.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      "  capabilities: [], approval: { required: true },",
      '  handler: async () => "archived",',
      "} as const;",
    ].join("\n"),
  );
  return root;
}

function recordingProvider(requests: ModelRequest[]): ModelProvider {
  return {
    async *stream(request) {
      requests.push(structuredClone(request));
      const last = request.messages.at(-1);
      if (last?.role === "tool") yield { type: "text", text: "Done" };
      else yield { type: "tool.call", call: { id: "c1", name: "archive", arguments: {} } };
      yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

const system = (request: ModelRequest): string =>
  request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition not reached.");
}

it("keeps a waiting run on the instructions and skills it started with", async () => {
  const root = await scaffold();
  const databasePath = join(root, "state.sqlite");
  const store = createSqliteEventStore({ databasePath });
  const engine = createSqliteEngine({ databasePath });
  const requests: ModelRequest[] = [];
  const provider = recordingProvider(requests);

  const waiting = await runProject(root, {
    runId: "run-1",
    message: "Archive it",
    provider,
    eventStore: store,
    engine,
  });

  expect(waiting.status).toBe("waiting");

  await writeFile(join(root, "agent.md"), "# Edited instructions\n");
  await writeFile(
    join(root, "skills", "triage", "SKILL.md"),
    "---\ndescription: Edited skill.\n---\nEdited skill body.",
  );
  await engine.signal("run-1", "approval:run-1:0:0", { approved: true });
  await until(async () => (await store.getRun("run-1"))?.status === "completed");

  expect(requests.length).toBeGreaterThanOrEqual(2);
  for (const request of requests) {
    expect(system(request)).toContain("Original instructions");
    expect(system(request)).toContain("Original skill.");
    expect(system(request)).not.toContain("Edited");
  }

  const fresh = await runProject(root, {
    runId: "run-2",
    message: "Again",
    provider,
    eventStore: store,
    engine,
  });
  expect(fresh.events.find((e) => e.type === "instructions.composed")?.payload.content).toContain(
    "Edited instructions",
  );
});
