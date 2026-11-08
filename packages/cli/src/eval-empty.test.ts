import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function projectWithoutEvals(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-empty-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  return root;
}

describe("plico eval with no evals", () => {
  it("fails and says so, so a CI gate does not pass with nothing tested", async () => {
    const root = await projectWithoutEvals();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", root])).toBe(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("No eval cases found");
    expect(String(error.mock.calls[0]?.[0])).toContain("--allow-empty");
  });

  it("passes with --allow-empty", async () => {
    const root = await projectWithoutEvals();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", "--allow-empty", root])).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("No eval cases found");
  });

  it("still reports an empty summary as JSON and exits 1", async () => {
    const root = await projectWithoutEvals();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", "--json", root])).toBe(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ total: 0 });
  });
});
