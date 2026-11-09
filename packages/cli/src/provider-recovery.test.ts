import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { main } from "./cli.js";

async function scaffold(prefix: string, config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(join(root, "plico.config.ts"), config);
  await writeFile(join(root, "agent.md"), "# Demo");
  return root;
}

it("does not recover a different project's run using the current project's provider", async () => {
  const current = await scaffold(
    "plico-cli-current-",
    'export default { schemaVersion: 1, name: "Current", model: { provider: "openai", name: "test" } };',
  );
  const other = await scaffold(
    "plico-cli-other-",
    'export default { schemaVersion: 1, name: "Other" };',
  );
  const databasePath = join(current, "shared.sqlite");
  const { execFileSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const runtimeUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const code = `import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(runtimeUrl)};
    const [root, db] = process.argv.slice(1);
    await runProject(root, { runId: "other-run", message: "private-other-project", engine: createSqliteEngine({ databasePath: db }), eventStore: createSqliteEventStore({ databasePath: db }), provider: { async *stream() { process.kill(process.pid, "SIGKILL"); } } });`;
  expect(() =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code, other, databasePath],
      { stdio: "pipe" },
    ),
  ).toThrow();
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      bodies.push(body);
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
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`);
  try {
    expect(
      await main([
        "node",
        "plico",
        "run",
        "--json",
        "--message",
        "current prompt",
        "--db",
        databasePath,
        current,
      ]),
    ).toBe(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain("private-other-project");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30000);

it("leaves an interrupted run untouched when the provider credential changes", async () => {
  const root = await scaffold(
    "plico-cli-account-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai", name: "test" } };',
  );
  const databasePath = join(root, "state.sqlite");
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      bodies.push(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: { content: "Done" }, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const { execFileSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const runtimeUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `import { createSqliteEngine, createSqliteEventStore, modelProviderRecoveryKey, runProject } from ${JSON.stringify(runtimeUrl)};
    const [root, db] = process.argv.slice(1);
    await runProject(root, { runId: "old-account", message: "private prompt", providerRecoveryKey: modelProviderRecoveryKey({ provider: "openai", name: "test" }), engine: createSqliteEngine({ databasePath: db }), eventStore: createSqliteEventStore({ databasePath: db }), provider: { async *stream() { process.kill(process.pid, "SIGKILL"); } } });`;
  expect(() =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", program, root, databasePath],
      {
        stdio: "pipe",
        env: { ...process.env, OPENAI_API_KEY: "old-secret", OPENAI_BASE_URL: baseURL },
      },
    ),
  ).toThrow();
  const { createSqliteEventStore } = await import("@plico-ai/runtime");
  const store = createSqliteEventStore({ databasePath, readOnly: true });
  const before = await store.getRun("old-account");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "new-secret");
  vi.stubEnv("OPENAI_BASE_URL", baseURL);
  try {
    expect(
      await main([
        "node",
        "plico",
        "run",
        "--json",
        "--message",
        "new prompt",
        "--db",
        databasePath,
        root,
      ]),
    ).toBe(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain("private prompt");
    expect(await store.getRun("old-account")).toEqual(before);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30000);

it("recovers a matching provider run when the server starts", async () => {
  const root = await scaffold(
    "plico-serve-recovery-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai", name: "test" } };',
  );
  await writeFile(
    join(root, "tools", "block.tool.ts"),
    `export default { name: "block", description: "block", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: async () => { if (process.env.PLICO_CRASH_TEST === "1") process.kill(process.pid, "SIGKILL"); return new Promise(() => {}); } };`,
  );
  const databasePath = join(root, "state.sqlite");
  let received!: () => void;
  const requestReceived = new Promise<void>((resolve) => {
    received = resolve;
  });
  let body = "";
  const server = createServer((req, res) => {
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      received();
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: { content: "Recovered" }, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const { createHash } = await import("node:crypto");
  const identity = createHash("sha256")
    .update(JSON.stringify(["openai", "test", baseURL, "test"]))
    .digest("hex");
  const { execFileSync, spawn } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const runtimeUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(runtimeUrl)};
    const [root, db, key] = process.argv.slice(1);
    await runProject(root, { runId: "recover-server", message: "resume me", providerRecoveryKey: key, engine: createSqliteEngine({ databasePath: db }), eventStore: createSqliteEventStore({ databasePath: db }), provider: { async *stream() { process.kill(process.pid, "SIGKILL"); } } });`;
  expect(() =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", program, root, databasePath, identity],
      { stdio: "pipe" },
    ),
  ).toThrow();
  const scriptedProgram = `import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(runtimeUrl)};
    const [root, db] = process.argv.slice(1);
    await runProject(root, { runId: "blocked-script", script: [{ type: "tool.call", toolName: "block", arguments: {} }], engine: createSqliteEngine({ databasePath: db }), eventStore: createSqliteEventStore({ databasePath: db }) });`;
  expect(() =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", scriptedProgram, root, databasePath],
      { stdio: "pipe", env: { ...process.env, PLICO_CRASH_TEST: "1" } },
    ),
  ).toThrow();
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      join(process.cwd(), "packages/cli/src/cli.ts"),
      "serve",
      "--port",
      "0",
      "--db",
      databasePath,
      root,
    ],
    {
      env: {
        ...process.env,
        OPENAI_API_KEY: "test",
        OPENAI_BASE_URL: baseURL,
        PLICO_CRASH_TEST: "",
      },
      stdio: "pipe",
    },
  );
  try {
    await Promise.race([
      requestReceived,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Provider recovery did not run")), 5000),
      ),
    ]);
    expect(body).toContain("resume me");
    const { createSqliteEventStore } = await import("@plico-ai/runtime");
    const store = createSqliteEventStore({ databasePath, readOnly: true });
    await vi.waitFor(
      async () =>
        expect(await store.getRun("recover-server")).toMatchObject({
          status: "completed",
          output: "Recovered",
        }),
      { timeout: 5000 },
    );
  } finally {
    child.kill();
    await new Promise<void>((resolve) => child.once("close", () => resolve()));
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30000);

it("keeps interruption handling active while an older run is recovering", {
  timeout: 30000,
}, async () => {
  const root = await scaffold(
    "plico-cli-recovery-interrupt-",
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai", name: "test", retries: 0 } };',
  );
  const databasePath = join(root, "state.sqlite");
  let recovering!: () => void;
  const recoveryStarted = new Promise<void>((resolve) => {
    recovering = resolve;
  });
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      if (body.includes("older prompt")) {
        recovering();
        return;
      }
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
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256")
    .update(JSON.stringify(["openai", "test", baseURL, "test"]))
    .digest("hex");
  const { execFileSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const url = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(url)}; const [root, db, key] = process.argv.slice(1); await runProject(root, { runId: "older", message: "older prompt", providerRecoveryKey: key, engine: createSqliteEngine({ databasePath: db }), eventStore: createSqliteEventStore({ databasePath: db }), provider: { async *stream() { process.kill(process.pid, "SIGKILL"); } } });`;
  expect(() =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", program, root, databasePath, key],
      { stdio: "pipe" },
    ),
  ).toThrow();
  const prior = process.listeners("SIGINT");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_BASE_URL", baseURL);
  try {
    const run = main([
      "node",
      "plico",
      "run",
      "--json",
      "--message",
      "new prompt",
      "--db",
      databasePath,
      root,
    ]);
    await Promise.all([run, recoveryStarted]);
    const listener = process.listeners("SIGINT").find((item) => !prior.includes(item));
    expect(listener).toBeDefined();
    if (listener) Reflect.apply(listener, process, ["SIGINT"]);
    const { createSqliteEventStore } = await import("@plico-ai/runtime");
    const store = createSqliteEventStore({ databasePath, readOnly: true });
    await vi.waitFor(
      async () => expect(await store.getRun("older")).toMatchObject({ status: "cancelled" }),
      { timeout: 3000 },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});
