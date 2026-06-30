import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";
import type { ScaffoldPrompts } from "./prompts.js";

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

  it("runs an interactive scaffold flow when no target directory is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const start = vi.fn();
    const stop = vi.fn();
    const prompts: ScaffoldPrompts = {
      intro: vi.fn(),
      outro: vi.fn(),
      text: vi
        .fn()
        .mockResolvedValueOnce(root)
        .mockResolvedValueOnce("My Project"),
      spinner: () => ({ start, stop }),
      cancel: vi.fn(),
      isCancel: (value): value is symbol => typeof value === "symbol",
    };

    const exitCode = await main(["node", "create-plico"], prompts);

    expect(exitCode).toBe(0);
    expect(start).toHaveBeenCalledWith("Creating scaffold...");
    expect(stop).toHaveBeenCalledWith(`Created scaffold in ${root}`);
    expect(await readFile(join(root, "README.md"), "utf8")).toContain("# My Project");
  });
});
