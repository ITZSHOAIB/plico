import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { main } from "./cli.js";

const workflow = `export default {
  input: { type: "object" },
  async run({ agent }) {
    const draft = await agent("writer", { task: "Draft" });
    return \`Final: \${draft}\`;
  },
};
`;

it("prints a workflow's final output last and keeps child model output out of stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-child-output-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents", "workflows"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Desk", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "You answer tickets.\n");
  await writeFile(join(root, "agents", "writer.md"), "You write replies.\n");
  await writeFile(join(root, "workflows", "reply.ts"), workflow);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta: object, finish: string | null, usage?: object) => ({
      id: "x",
      object: "chat.completion.chunk",
      created: 1,
      model: "test",
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...(usage ? { usage } : {}),
    });
    for (const part of [
      chunk({ content: "child draft" }, null),
      chunk({}, "stop", { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
    ])
      res.write(`data: ${JSON.stringify(part)}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.spyOn(console, "log").mockImplementation(() => {});
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`);
  try {
    const code = await main(["node", "plico", "run", "--workflow", "reply", "--input", "{}", root]);
    const out = written.join("");
    expect(code).toBe(0);
    expect(out.trim()).toBe("Final: child draft");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30_000);
