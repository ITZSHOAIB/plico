import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("plico run reads credentials from the project .env", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-env-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Env", model: { provider: "openai", name: "m" } };',
  );
  await writeFile(join(root, "agent.md"), "# Env\n\nAnswer from the project.\n");
  // A closed port: with a key the run reaches the network step instead of failing on the credential.
  await writeFile(
    join(root, ".env"),
    "OPENAI_API_KEY=from-file\nOPENAI_BASE_URL=http://127.0.0.1:1/v1\n",
  );
  vi.stubEnv("OPENAI_API_KEY", "");
  delete process.env.OPENAI_API_KEY;
  vi.stubEnv("OPENAI_BASE_URL", "");
  delete process.env.OPENAI_BASE_URL;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await main(["node", "plico", "run", "--json", "--message", "hello", root]);

  const result = JSON.parse(String(log.mock.calls[0]?.[0]));
  const message = result.events.find((event: { type: string }) => event.type === "run.error")
    .payload.message;
  expect(message).not.toContain("OPENAI_API_KEY");
});
