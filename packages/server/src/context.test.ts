import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlicoEvent } from "@plico-ai/contracts";
import {
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  modelProviderAccountKey,
} from "@plico-ai/runtime";
import { describe, expect, it, vi } from "vitest";
import { createPlico, type Plico } from "./index.js";
import { createTestServer } from "./testing/test-server.js";

async function openPlico(): Promise<Plico> {
  const root = await mkdtemp(join(tmpdir(), "plico-context-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Context Agent" };',
  );
  await writeFile(join(root, "agent.md"), "Answer briefly.");
  await writeFile(
    join(root, "tools", "who.tool.ts"),
    'export default { name: "who", description: "Report the caller", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: (_input, ctx) => ({ context: ctx.context ?? null }) };',
  );
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    'export default { name: "archive", description: "Archive a record", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => "archived" };',
  );
  return createPlico({ projectRoot: root, databasePath: join(root, "state.sqlite") });
}

async function drain(events: AsyncIterable<PlicoEvent>): Promise<PlicoEvent[]> {
  const seen: PlicoEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe("context", () => {
  it("reaches tools as ctx.context and is recorded on run.started", async () => {
    const plico = await openPlico();
    try {
      const context = { userId: "u-1", roles: ["admin"] };
      const { runId } = await plico.runs.start({
        script: [{ type: "tool.call", toolName: "who", arguments: {} }],
        context,
      });
      const events = await drain(plico.runs.events(runId));

      const started = events.find((event) => event.type === "run.started");
      expect(started?.type === "run.started" ? started.payload.context : undefined).toEqual(
        context,
      );
      const result = events.find((event) => event.type === "tool.result");
      expect(result?.type === "tool.result" ? result.payload.result : undefined).toEqual({
        context,
      });
    } finally {
      await plico.close();
    }
  });

  it("gives tools no context when the host passes none", async () => {
    const plico = await openPlico();
    try {
      const { runId } = await plico.runs.start({
        script: [{ type: "tool.call", toolName: "who", arguments: {} }],
      });
      const events = await drain(plico.runs.events(runId));
      const result = events.find((event) => event.type === "tool.result");
      expect(result?.type === "tool.result" ? result.payload.result : undefined).toEqual({
        context: null,
      });
    } finally {
      await plico.close();
    }
  });

  it("rejects context that is not a JSON object", async () => {
    const plico = await openPlico();
    try {
      await expect(plico.runs.start({ context: "admin" as never })).rejects.toMatchObject({
        code: "request.invalid",
      });
    } finally {
      await plico.close();
    }
  });

  it("records the deciding context on approval.decided", async () => {
    const plico = await openPlico();
    try {
      const { runId } = await plico.runs.start({
        script: [{ type: "tool.call", toolName: "archive", arguments: {} }],
        context: { userId: "requester" },
      });
      const waiting: PlicoEvent[] = [];
      for await (const event of plico.runs.events(runId, { pollMs: 20 })) {
        waiting.push(event);
        if (event.type === "run.waiting") break;
      }
      const requested = waiting.find((event) => event.type === "approval.requested");
      if (requested?.type !== "approval.requested") throw new Error("Run did not ask for approval");

      await plico.approvals.decide(runId, requested.payload.requestId, true, {
        context: { userId: "approver" },
      });
      const events = await drain(
        plico.runs.events(runId, { after: waiting.at(-1)?.sequence ?? 0, pollMs: 20 }),
      );

      const decided = events.find((event) => event.type === "approval.decided");
      expect(decided?.type === "approval.decided" ? decided.payload : undefined).toEqual({
        requestId: requested.payload.requestId,
        approved: true,
        context: { userId: "approver" },
      });
    } finally {
      await plico.close();
    }
  });
});

describe("context after a restart", () => {
  it("resumes a queued thread run with the context and metadata it was sent with", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-context-queued-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir));
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Demo" };',
    );
    await writeFile(join(root, "agent.md"), "instructions");
    const databasePath = join(root, "state.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    const threadStore = createSqliteThreadStore({ databasePath });
    const thread = await threadStore.createThread({ tenant: "acme" });
    const accountKey = modelProviderAccountKey({ provider: "openai-compatible", name: "test" });
    await threadStore.addMessage(thread.id, "resume me", "queued-context", {
      providerKey: accountKey,
      projectRoot: root,
      context: { userId: "u-1" },
    });
    const api = createTestServer({
      projectRoot: root,
      eventStore,
      threadStore,
      engine: createSqliteEngine({ databasePath }),
      provider: {
        async *stream() {
          yield { type: "text", text: "Recovered" };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
      providerRecoveryKey: "recovery-key",
      providerAccountKey: accountKey,
    });
    try {
      await api.recover();
      await vi.waitFor(async () =>
        expect((await eventStore.getRun("queued-context"))?.status).toBe("completed"),
      );
      const run = await eventStore.getRun("queued-context");
      expect(run?.metadata).toEqual({ tenant: "acme" });
      const started = (await eventStore.getEvents("queued-context")).find(
        (event) => event.type === "run.started",
      );
      expect(started?.type === "run.started" ? started.payload.context : undefined).toEqual({
        userId: "u-1",
      });
    } finally {
      threadStore.close();
    }
  });
});

describe("approval context over HTTP", () => {
  it("does not let a client write the deciding context through the signal route", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-context-forge-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir));
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Demo" };',
    );
    await writeFile(join(root, "agent.md"), "instructions");
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(
      join(root, "tools", "archive.tool.ts"),
      'export default { name: "archive", description: "Archive", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => "archived" };',
    );
    const databasePath = join(root, "state.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    const api = createTestServer({
      projectRoot: root,
      eventStore,
      engine: createSqliteEngine({ databasePath }),
    });
    const server = createServer(api.requestListener);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const { runId } = await api.plico.runs.start({
        script: [{ type: "tool.call", toolName: "archive", arguments: {} }],
      });
      await vi.waitFor(async () =>
        expect((await eventStore.getRun(runId))?.status).toBe("waiting"),
      );
      const response = await fetch(`${base}/v1/runs/${runId}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `approval:${runId}:0`,
          value: { approved: true, context: { userId: "forged" } },
        }),
      });
      expect(response.status).toBe(200);
      await vi.waitFor(async () =>
        expect((await eventStore.getRun(runId))?.status).toBe("completed"),
      );
      const decided = (await eventStore.getEvents(runId)).find(
        (event) => event.type === "approval.decided",
      );
      expect(decided?.type === "approval.decided" ? decided.payload : undefined).toEqual({
        requestId: `${runId}:0`,
        approved: true,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
