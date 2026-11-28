import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  type ModelProvider,
} from "@plico-ai/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestServer } from "./testing/test-server.js";

const review = `export default {
  input: { type: "object", required: ["ticket"], properties: { ticket: { type: "string" } } },
  async run({ input, agent }) {
    const draft = await agent("researcher", { task: \`Draft \${input.ticket}\` });
    return \`Reviewed: \${draft}\`;
  },
};
`;

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-multi-agent-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents", "workflows"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Desk", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "---\nagents: [researcher]\n---\nYou answer tickets.\n");
  await writeFile(
    join(root, "agents", "researcher.md"),
    "---\ndescription: Finds facts.\ntools: [lookup]\n---\nYou research tickets.\n",
  );
  await writeFile(join(root, "workflows", "review.ts"), review);
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    [
      "export default {",
      '  name: "lookup", description: "Look up a record.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      '  capabilities: [], approval: { required: true }, handler: async () => "record 42",',
      "} as const;",
    ].join("\n"),
  );
  return root;
}

/** The supervisor delegates once; the researcher calls lookup once. Each then answers. */
const desk: ModelProvider = {
  async *stream(request) {
    const researcher = request.messages[0]?.content.includes("You research");
    const tool = [...request.messages].reverse().find((message) => message.role === "tool");
    if (tool) yield { type: "text", text: researcher ? "Found 42" : `Done: ${tool.content}` };
    else if (researcher)
      yield { type: "tool.call", call: { id: "c1", name: "lookup", arguments: {} } };
    else
      yield {
        type: "tool.call",
        call: { id: "c1", name: "delegate_researcher", arguments: { task: "Find 42" } },
      };
    yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
  },
};

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function start() {
  const root = await scaffold();
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  const api = createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    engine: createSqliteEngine({ databasePath }),
    provider: desk,
    providerRecoveryKey: "test",
    allowScript: true,
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown = {}) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { ...api, eventStore, base, post };
}

describe("multi-agent projects", () => {
  it("routes a child's approval through the root and keeps child runs out of the run list", async () => {
    const { plico, eventStore, base, post } = await start();
    const thread = await plico.threads.create();
    const message = await plico.threads.send(thread.id, "Ticket 42");
    const runId = message.runId ?? "";
    await vi.waitFor(async () => expect((await eventStore.getRun(runId))?.status).toBe("waiting"));

    const listed = (await (await fetch(`${base}/v1/runs`)).json()) as Array<{ runId: string }>;
    expect(listed.map((run) => run.runId)).toEqual([runId]);
    const children = (await (
      await fetch(`${base}/v1/runs?parentRunId=${encodeURIComponent(runId)}`)
    ).json()) as Array<{ runId: string; agentId: string; parentRunId: string }>;
    expect(children).toEqual([
      expect.objectContaining({ agentId: "researcher", parentRunId: runId }),
    ]);
    const childRunId = children[0]?.runId ?? "";

    const cancelChild = await post(`/v1/runs/${childRunId}/cancel`);
    expect(cancelChild.status).toBe(409);
    expect(await cancelChild.json()).toMatchObject({ error: { code: "run.child" } });

    const asked = (await eventStore.getEvents(runId)).find(
      (event) => event.type === "approval.requested",
    );
    expect(asked?.payload).toMatchObject({ runId: childRunId, toolName: "lookup" });
    const requestId = asked?.type === "approval.requested" ? asked.payload.requestId : "";
    expect(await plico.approvals.decide(runId, requestId, true)).toBe("accepted");

    await vi.waitFor(async () =>
      expect((await eventStore.getRun(runId))?.status).toBe("completed"),
    );
    expect((await eventStore.getRun(childRunId))?.status).toBe("completed");
    expect((await plico.threads.messages(thread.id)).at(-1)).toMatchObject({
      role: "assistant",
      content: 'Done: {"output":"Found 42"}',
    });
  });

  it("binds a thread to a named agent", async () => {
    const { plico, eventStore, post } = await start();
    const thread = await plico.threads.create({ agent: "researcher" });
    expect(thread.agentId).toBe("researcher");
    expect(await plico.threads.get(thread.id)).toMatchObject({ agentId: "researcher" });

    const message = await plico.threads.send(thread.id, "Find 42");
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(message.runId ?? ""))?.status).toBe("waiting"),
    );
    expect((await eventStore.getEvents(message.runId ?? ""))[0]?.payload).toMatchObject({
      agentId: "researcher",
    });

    const unknown = await post("/v1/threads", { agent: "nobody" });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      error: {
        code: "request.invalid",
        message: expect.stringContaining('Unknown agent "nobody"'),
      },
    });

    const unknownRun = await post("/v1/runs", { agent: "nobody", message: "hi" });
    expect(unknownRun.status).toBe(400);
    expect(await unknownRun.json()).toMatchObject({ error: { code: "request.invalid" } });
  });

  it("starts a selected workflow over the API", async () => {
    const { eventStore, post } = await start();
    const scripted = await post("/v1/runs", {
      workflow: "review",
      input: { ticket: "T-1" },
      script: [
        {
          type: "agent.call",
          agentId: "researcher",
          script: [{ type: "assistant.output", content: "draft" }],
        },
      ],
    });
    expect(scripted.status).toBe(202);
    const { runId } = (await scripted.json()) as { runId: string };
    await vi.waitFor(async () =>
      expect(await eventStore.getRun(runId)).toMatchObject({
        status: "completed",
        workflowId: "review",
        output: "Reviewed: draft",
      }),
    );

    const nested = await post("/v1/runs", {
      script: [
        {
          type: "tool.call",
          toolName: "delegate_researcher",
          arguments: { task: "Find 42" },
          script: [{ type: "tool.call", toolName: "lookup", arguments: {}, live: true }],
        },
      ],
    });
    expect(nested.status).toBe(400);
    expect(await nested.json()).toMatchObject({
      error: { message: expect.stringContaining("Script step 0.0 is live") },
    });

    const invalid = await post("/v1/runs", { workflow: "review", input: { nope: 1 } });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "input.invalid" } });
  });
});
