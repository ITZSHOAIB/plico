import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico-ai/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestServer } from "./testing/test-server.js";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function start(allowScript?: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-script-gate-"));
  await mkdir(join(root, "skills"), { recursive: true });
  const plico = await createTestServer({
    projectRoot: root,
    eventStore: createSqliteEventStore({ databasePath: join(root, "db.sqlite") }),
    ...(allowScript === undefined ? {} : { allowScript }),
  });
  const server = createServer(plico.requestListener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("scripted runs over HTTP", () => {
  const script = [{ type: "assistant.output", content: "Hi" }];

  it.each(["/v1/runs", "/v1/runs/dry"])("refuses a script on %s by default", async (path) => {
    const base = await start();

    const response = await post(base, path, { script });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "run.script_disabled" } });
    const runs = await (await fetch(`${base}/v1/runs`)).json();
    expect(runs).toEqual([]);
  });

  it("accepts a script when the server opts in", async () => {
    const base = await start(true);

    const response = await post(base, "/v1/runs/dry", { script });

    expect(response.status).toBe(200);
  });
});

describe("tool steps in scripted runs over HTTP", () => {
  async function startWithTool(): Promise<{ base: string; marker: string }> {
    const root = await mkdtemp(join(tmpdir(), "plico-script-mock-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir), { recursive: true });
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Mocked" };',
    );
    await writeFile(join(root, "agent.md"), "# Mocked\n\nHelp.\n");
    const marker = join(root, "handler-ran.txt");
    await writeFile(
      join(root, "tools", "touch.tool.ts"),
      `import { writeFileSync } from "node:fs";
export default {
  name: "touch",
  description: "Writes a marker file.",
  inputSchema: { type: "object", properties: {} },
  capabilities: [],
  approval: { required: false },
  handler: async () => { writeFileSync(${JSON.stringify(marker)}, "ran"); return { real: true }; },
};`,
    );
    const plico = await createTestServer({
      projectRoot: root,
      eventStore: createSqliteEventStore({ databasePath: join(root, "db.sqlite") }),
      allowScript: true,
    });
    const server = createServer(plico.requestListener);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, marker };
  }

  async function finished(
    base: string,
    runId: string,
  ): Promise<Array<{ type: string; payload: unknown }>> {
    await vi.waitFor(async () => {
      const run = (await (await fetch(`${base}/v1/runs/${runId}`)).json()) as { status: string };
      expect(["completed", "failed"]).toContain(run.status);
    });
    return (await (await fetch(`${base}/v1/runs/${runId}/events`)).json()) as Array<{
      type: string;
      payload: unknown;
    }>;
  }

  it("uses the step's result on /v1/runs/dry and never runs the handler", async () => {
    const { base, marker } = await startWithTool();

    const response = await post(base, "/v1/runs/dry", {
      script: [{ type: "tool.call", toolName: "touch", arguments: {}, result: { mocked: true } }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "completed" });
    expect(existsSync(marker)).toBe(false);
  });

  it("uses the step's result on /v1/runs and never runs the handler", async () => {
    const { base, marker } = await startWithTool();

    const response = await post(base, "/v1/runs", {
      script: [{ type: "tool.call", toolName: "touch", arguments: {}, result: { mocked: true } }],
    });
    const { runId } = (await response.json()) as { runId: string };
    const events = await finished(base, runId);

    expect(events.find((event) => event.type === "tool.result")?.payload).toMatchObject({
      result: { mocked: true },
    });
    expect(existsSync(marker)).toBe(false);
  });

  it("fails a tool step with no result instead of running the handler", async () => {
    const { base, marker } = await startWithTool();

    const response = await post(base, "/v1/runs", {
      script: [{ type: "tool.call", toolName: "touch", arguments: {} }],
    });
    const { runId } = (await response.json()) as { runId: string };
    const events = await finished(base, runId);

    expect(events.at(-1)?.type).toBe("run.failed");
    expect(existsSync(marker)).toBe(false);
  });

  it.each(["/v1/runs", "/v1/runs/dry"])("rejects a live tool step on %s", async (path) => {
    const { base, marker } = await startWithTool();

    const response = await post(base, path, {
      script: [{ type: "tool.call", toolName: "touch", arguments: {}, live: true }],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request.invalid_body" } });
    expect(existsSync(marker)).toBe(false);
  });
});
