import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { servePlicoMock } = vi.hoisted(() => ({
  servePlicoMock: vi.fn(),
}));

vi.mock("@plico/server", () => ({
  servePlico: servePlicoMock,
}));

import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
  servePlicoMock.mockReset();
});

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

describe("serve", () => {
  it("passes host, port, database path, and project root to @plico/server", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const databasePath = join(root, "state", "custom.sqlite");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const close = vi.fn();

    servePlicoMock.mockResolvedValue({
      address: () => ({ family: "IPv4", address: "127.0.0.1", port: 4321 }),
      close,
    });

    const exitCode = await main([
      "node",
      "plico",
      "serve",
      "--host",
      "0.0.0.0",
      "--port",
      "4321",
      "--db",
      databasePath,
      root,
    ]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(servePlicoMock).toHaveBeenCalledWith({
      projectRoot: root,
      databasePath,
      host: "0.0.0.0",
      port: 4321,
    });
    expect(logSpy.mock.calls.map(([line]) => String(line))).toEqual([
      "Serving Plico at http://127.0.0.1:4321",
      `Database: ${databasePath}`,
    ]);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uses the default local database path when --db is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeValidProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    servePlicoMock.mockResolvedValue({
      address: () => ({ family: "IPv4", address: "127.0.0.1", port: 3000 }),
      close: vi.fn(),
    });

    const exitCode = await main(["node", "plico", "serve", root]);

    expect(exitCode).toBe(0);
    expect(servePlicoMock).toHaveBeenCalledWith({
      projectRoot: root,
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    expect(logSpy.mock.calls.map(([line]) => String(line))).toEqual([
      "Serving Plico at http://127.0.0.1:3000",
      `Database: ${join(root, ".plico", "plico.sqlite")}`,
    ]);
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
