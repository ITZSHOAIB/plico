import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

describe("create-plico main", () => {
  it("creates a scaffold in the target directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await main(["node", "create-plico", root]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(`Created Plico scaffold in ${root}`);
    expect(await readFile(join(root, "agent.md"), "utf8")).toContain("Internal Ops Agent");

    logSpy.mockRestore();
  });
});
