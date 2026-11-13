import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, createSqliteThreadStore } from "@plico-ai/runtime";
import { expect, it, vi } from "vitest";
import { createTestServer } from "./testing/test-server.js";

const agent = [
  "---",
  "input:",
  "  type: object",
  "  required: [ticket]",
  "  properties:",
  "    ticket:",
  "      type: string",
  "---",
  "Triage tickets.",
].join("\n");

it("rejects invalid run input with input.invalid and accepts valid input", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-run-input-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), agent);
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  const seen: string[] = [];
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    provider: {
      async *stream(request) {
        seen.push(request.messages.at(-1)?.content ?? "");
        yield { type: "text", text: "ok" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const thread = (await (await fetch(`${base}/v1/threads`, { method: "POST" })).json()) as {
      id: string;
    };
    const post = (body: unknown) =>
      fetch(`${base}/v1/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const missing = await post({ content: "go" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: "input.invalid" } });

    const wrong = await post({ input: { ticket: 7 } });
    expect(wrong.status).toBe(400);
    expect(JSON.stringify(await wrong.json())).toContain("ticket: expected string");
    expect(await eventStore.listRuns()).toEqual([]);

    const ok = await post({ input: { ticket: "T-1" } });
    expect(ok.status).toBe(201);
    await vi.waitFor(() => expect(seen).toEqual([JSON.stringify({ ticket: "T-1" }, null, 2)]));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
