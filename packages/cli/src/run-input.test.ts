import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { main } from "./cli.js";

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

async function typedProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-input-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), agent);
  return root;
}

it("refuses invalid --input before any run starts", async () => {
  const root = await typedProject();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:1/v1");
  try {
    const code = await main(["node", "plico", "run", "--input", '{"ticket":7}', root]);

    expect(code).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("ticket: expected string");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

it("refuses a run with no input when the agent requires it", async () => {
  const root = await typedProject();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:1/v1");
  try {
    const code = await main(["node", "plico", "run", root]);

    expect(code).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("input is required");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

it("reads input from --input-file", async () => {
  const root = await typedProject();
  await writeFile(join(root, "input.json"), '{"ticket":7}');
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:1/v1");
  try {
    const code = await main([
      "node",
      "plico",
      "run",
      "--input-file",
      join(root, "input.json"),
      root,
    ]);

    expect(code).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("ticket: expected string");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});
