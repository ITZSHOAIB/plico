import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These exercise the built bin, as npm runs it. `pnpm build` comes before `pnpm test`.
const distDir = fileURLToPath(new URL("../dist", import.meta.url));

async function linkedBin(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "plico-bin-"));
  const link = join(dir, "linked");
  // A junction needs no privilege on Windows; on POSIX it is a plain directory symlink.
  await symlink(distDir, link, "junction");
  return join(link, "cli.js");
}

describe("published plico bin", () => {
  it("starts with a node shebang so npm shims run it with node", async () => {
    const source = await readFile(join(distDir, "cli.js"), "utf8");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("runs when reached through a symlinked install path", async () => {
    const result = spawnSync(process.execPath, [await linkedBin(), "--version"], {
      encoding: "utf8",
    });

    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.status).toBe(0);
  });

  it("reports failure through a symlinked install path instead of exiting silently", async () => {
    const result = spawnSync(process.execPath, [await linkedBin(), "validate", tmpdir()], {
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toBe("");
  });
});
