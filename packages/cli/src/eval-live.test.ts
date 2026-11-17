import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

const servers: Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise((r) => server.close(r))));
});

async function project(cases: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-eval-live-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "agent-model" } };',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  for (const [file, text] of Object.entries(cases))
    await writeFile(join(root, "evals", file), text);
  return root;
}

/** An OpenAI-compatible server that answers every request with "Hello" and records the model. */
async function modelServer(models: string[]): Promise<void> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
    });
    req.on("end", () => {
      models.push(JSON.parse(body).model);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (choice: object, extra: object = {}) =>
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, ...choice }], ...extra })}\n\n`;
      res.write(chunk({ delta: { content: "Hello" }, finish_reason: null }));
      res.write(
        chunk(
          { delta: {}, finish_reason: "stop" },
          { usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
        ),
      );
      res.end("data: [DONE]\n\n");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`);
}

function lines(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((call) => String(call[0])).join("\n");
}

const hello = "---\ninput: hi\nexpect:\n  contains: Hello\n---\n";

describe("plico eval --live", { timeout: 30_000 }, () => {
  it("runs cases against the configured model, or the one --model names", async () => {
    const models: string[] = [];
    await modelServer(models);
    const root = await project({ "hello.md": hello, "no-input.md": "---\n---\n" });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const db = ["--db", join(root, "s.sqlite")];

    expect(await main(["node", "plico", "eval", "--live", ...db, root])).toBe(0);
    expect(lines(log)).toContain("PASS hello");
    expect(lines(log)).toContain("SKIP no-input: Has no input");

    const override = ["--model", "openai-compatible:other-model"];
    expect(await main(["node", "plico", "eval", "--live", ...override, ...db, root])).toBe(0);
    expect(models).toEqual(["agent-model", "other-model"]);
  });

  it("exits 1 when the token cap leaves cases unrun", async () => {
    await modelServer([]);
    const root = await project({ "a.md": hello, "b.md": hello });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const options = ["--max-tokens", "5", "--concurrency", "1", "--db", join(root, "s.sqlite")];

    expect(await main(["node", "plico", "eval", "--live", ...options, root])).toBe(1);
    expect(lines(log)).toContain("SKIP b: Token cap of 5 reached.");
    expect(lines(error)).toContain("Token cap of 5 reached");
  });

  it("refuses live options without --live", async () => {
    const root = await project({ "hello.md": hello });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", "--mock-tools", root])).toBe(1);
    expect(lines(error)).toContain("--mock-tools requires --live");
  });
});
