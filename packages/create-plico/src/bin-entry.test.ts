import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These exercise the built bin, as npm runs it. `pnpm build` comes before `pnpm test`.
const distDir = fileURLToPath(new URL("../dist", import.meta.url));

describe("published create-plico bin", () => {
  it("starts with a node shebang so npm shims run it with node", async () => {
    const source = await readFile(join(distDir, "cli.js"), "utf8");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("scaffolds a project when reached through a symlinked install path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "plico-create-bin-"));
    const link = join(dir, "linked");
    await symlink(distDir, link, "junction");
    const target = join(dir, "demo");

    const result = spawnSync(process.execPath, [join(link, "cli.js"), target], {
      encoding: "utf8",
    });

    expect(result.stdout).toContain("Created Plico scaffold");
    expect(result.status).toBe(0);
    expect((await stat(join(target, "agent.md"))).isFile()).toBe(true);
  });
});
