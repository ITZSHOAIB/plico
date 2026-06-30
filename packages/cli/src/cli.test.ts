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
  await writeFile(
    join(root, "agent.md"),
    [
      "# Agent",
      "",
      "This project is organized file-first.",
      "",
      "Use the local Markdown instructions as the source of truth.",
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("main", () => {
  it("emits JSON for validate --json", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", "--json", root]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      issues: [],
      errors: [],
      warnings: [],
      project: {
        root,
        configPath: join(root, "plico.config.ts"),
        config: {
          schemaVersion: 1,
          name: "Internal Ops Agent",
        },
      },
    });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("plico.config.ts: Missing required file: plico.config.ts");
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Valid Plico project"));

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("emits JSON for failed validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", "--json", root]);

    expect(exitCode).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required file: plico.config.ts",
          severity: "error",
        }),
      ]),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required file: plico.config.ts",
          severity: "error",
        }),
      ]),
      warnings: [],
    });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints warnings without treating them as failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    await writeFile(join(root, "agent.md"), "# Agent\n\nFollow the project instructions.", "utf8");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "validate", root]);

    expect(exitCode).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith("agent.md: agent.md looks like placeholder content");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(`Valid Plico project: ${root}`);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
