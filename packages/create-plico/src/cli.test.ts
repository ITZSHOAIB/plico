import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";
import type { ScaffoldPrompts } from "./prompts.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void out.push(String(line)));
  vi.spyOn(console, "error").mockImplementation((line: string) => void err.push(String(line)));
  return { out, err };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe("create-plico main", () => {
  it("creates a scaffold in the target directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const root = join(parent, "support-tools");
    await mkdir(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await main(["node", "create-plico", root]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(`Created Plico scaffold in ${root}`);
    const config = await readFile(join(root, "plico.config.ts"), "utf8");
    expect(config).toContain('name: "Support Tools"');
    expect(config).toContain('import { defineConfig } from "@plico-ai/sdk";');
    expect(config).toContain("export default defineConfig({");
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).toMatchObject({
      type: "module",
    });
    expect(await readFile(join(root, "tools", "readme.md"), "utf8")).toContain(
      "JSON Schema object or a Zod 3 or 4 schema",
    );

    logSpy.mockRestore();
  });

  it("runs an interactive scaffold flow when no target directory is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const start = vi.fn();
    const stop = vi.fn();
    const prompts: ScaffoldPrompts = {
      intro: vi.fn(),
      outro: vi.fn(),
      text: vi.fn().mockResolvedValueOnce(root).mockResolvedValueOnce("My Project"),
      select: vi.fn().mockResolvedValue("anthropic"),
      spinner: () => ({ start, stop }),
      cancel: vi.fn(),
      isCancel: (value): value is symbol => typeof value === "symbol",
    };

    const exitCode = await main(["node", "create-plico"], prompts);

    expect(exitCode).toBe(0);
    expect(start).toHaveBeenCalledWith("Creating scaffold...");
    expect(stop).toHaveBeenCalledWith(`Created scaffold in ${root}`);
    expect(await readFile(join(root, "README.md"), "utf8")).toContain("# My Project");
    expect(await readFile(join(root, "plico.config.ts"), "utf8")).toContain(
      'provider: "anthropic"',
    );
  });

  it("prints usage and exits 0 for --help without creating anything", async () => {
    const stray = join(process.cwd(), "--help");
    try {
      const { out } = capture();

      const exitCode = await main(["node", "create-plico", "--help"]);

      expect(exitCode).toBe(0);
      expect(out.join("\n")).toContain("Usage: create-plico");
      expect(await exists(stray)).toBe(false);
    } finally {
      await rm(stray, { recursive: true, force: true });
    }
  });

  it("prints the package version for --version", async () => {
    const { out } = capture();

    const exitCode = await main(["node", "create-plico", "--version"]);

    expect(exitCode).toBe(0);
    expect(out[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("rejects an unknown option with usage on stderr and creates nothing", async () => {
    const stray = join(process.cwd(), "--bogus");
    try {
      const { out, err } = capture();

      const exitCode = await main(["node", "create-plico", "--bogus"]);

      expect(exitCode).toBe(1);
      expect(out).toEqual([]);
      expect(err.join("\n")).toContain("Unknown option: --bogus");
      expect(err.join("\n")).toContain("Usage: create-plico");
      expect(await exists(stray)).toBe(false);
    } finally {
      await rm(stray, { recursive: true, force: true });
    }
  });

  it("prints usage instead of scaffolding when --help follows the directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const root = join(parent, "app");
    const { out } = capture();

    const exitCode = await main(["node", "create-plico", root, "--help"]);

    expect(exitCode).toBe(0);
    expect(out.join("\n")).toContain("Usage: create-plico");
    expect(await exists(root)).toBe(false);
  });

  it("takes the provider from --provider", async () => {
    const parent = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const root = join(parent, "app");
    capture();

    const exitCode = await main(["node", "create-plico", root, "--provider", "openai"]);

    expect(exitCode).toBe(0);
    expect(await readFile(join(root, "plico.config.ts"), "utf8")).toContain('provider: "openai"');
  });

  it("rejects an unknown provider before writing anything", async () => {
    const parent = await mkdtemp(join(tmpdir(), "plico-create-cli-"));
    const root = join(parent, "app");
    const { err } = capture();

    const exitCode = await main(["node", "create-plico", root, "--provider", "nope"]);

    expect(exitCode).toBe(1);
    expect(err.join("\n")).toContain("Unknown provider: nope");
    expect(await exists(root)).toBe(false);
  });
});
