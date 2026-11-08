import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These exercise the built bin, as npm runs it. `pnpm build` comes before `pnpm test`.
const distDir = fileURLToPath(new URL("../dist", import.meta.url));
// Starting the CLI loads the runtime and SQLite, which is slow on a cold CI runner. The child limit is
// shorter than the test limit, so a hung process fails with a null status rather than a timeout.
const CHILD_TIMEOUT_MS = 20_000;
const TEST_TIMEOUT_MS = 30_000;

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

  it(
    "runs when reached through a symlinked install path",
    async () => {
      const result = spawnSync(process.execPath, [await linkedBin(), "--version"], {
        encoding: "utf8",
        timeout: CHILD_TIMEOUT_MS,
      });

      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
      expect(result.status).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reports failure through a symlinked install path instead of exiting silently",
    async () => {
      const result = spawnSync(process.execPath, [await linkedBin(), "validate", tmpdir()], {
        encoding: "utf8",
        timeout: CHILD_TIMEOUT_MS,
      });

      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toBe("");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "prints no experimental warning for --version, validate, or a command that opens the database",
    async () => {
      const example = fileURLToPath(
        new URL("../../../examples/internal-ops-agent", import.meta.url),
      );
      for (const args of [["--version"], ["validate", example], ["runs", example]]) {
        const result = spawnSync(process.execPath, [join(distDir, "cli.js"), ...args], {
          encoding: "utf8",
          timeout: CHILD_TIMEOUT_MS,
        });

        expect(result.stderr, args.join(" ")).not.toContain("ExperimentalWarning");
      }
    },
    TEST_TIMEOUT_MS * 2,
  );
});
