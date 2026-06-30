import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

async function writeValidProject(root: string) {
  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "artifacts"), { recursive: true });
  await mkdir(join(root, "memory"), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    [
      "export default {",
      "  schemaVersion: 1,",
      '  name: "Internal Ops Agent",',
      "} as const;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "agent.md"), "# Agent", "utf8");
}

describe("main", () => {
  it("validates a project successfully", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(`Valid Plico project: ${root}`);
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports validation failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("plico.config.ts: Missing required file: plico.config.ts");
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Valid Plico project"));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
