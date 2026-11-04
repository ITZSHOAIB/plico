import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { main } from "./cli.js";

it("runs a configured model and stores its events for inspection", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-model-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunks = [
      {
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "test",
        choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }],
      },
      {
        id: "x",
        object: "chat.completion.chunk",
        created: 1,
        model: "test",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ];
    for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "test-cli-secret");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`);
  try {
    const code = await main(["node", "plico", "run", "--json", "--message", "hello", root]);
    expect(code).toBe(0);
    const result = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(result).toMatchObject({ status: "completed", output: "Hello" });
    const { createSqliteEventStore } = await import("@plico/runtime");
    const store = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
      readOnly: true,
    });
    expect(
      (await store.getEvents(result.runId)).some((event) => event.type === "model.delta"),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("test-cli-secret");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("requires model configuration for a non-dry run", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-no-model-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await main(["node", "plico", "run", "--message", "hello", root])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Model configuration is missing"));
  } finally {
    vi.restoreAllMocks();
  }
});

it("reports missing credentials without exposing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-no-key-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "");
  try {
    expect(await main(["node", "plico", "run", "--json", "--message", "hello", root])).toBe(1);
    const result = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(result.status).toBe("failed");
    expect(
      result.events.find((event: { type: string }) => event.type === "run.error").payload.message,
    ).toContain("OPENAI_API_KEY");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

it("accepts a message piped on standard input", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-stdin-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  let prompt = "";
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      prompt = body;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: { content: "Done" }, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join(process.cwd(), "packages/cli/src/cli.ts"), "run", "--json", root],
      {
        env: {
          ...process.env,
          OPENAI_API_KEY: "test",
          OPENAI_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
        },
      },
    );
    let output = "";
    child.stdout.on("data", (part) => {
      output += part;
    });
    child.stdin.end("piped message");
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({ status: "completed", output: "Done" });
    expect(prompt).toContain("piped message");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30000);
