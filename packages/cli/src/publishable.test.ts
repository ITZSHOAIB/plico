import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { packagesDir, workspaceManifests } from "./testing/workspace.js";

// These check what npm would publish. `pnpm build` comes before `pnpm test`.
const cliDir = fileURLToPath(new URL("..", import.meta.url));
const exampleProject = join(packagesDir, "..", "examples", "internal-ops-agent");
const CHILD_TIMEOUT_MS = 20_000;
const TEST_TIMEOUT_MS = 30_000;

describe("publishable CLI", () => {
  it("never depends on a private workspace package at runtime", () => {
    const manifests = workspaceManifests();
    const privateNames = new Set(manifests.filter((m) => m.private).map((m) => m.name));

    const leaks = manifests
      .filter((manifest) => !manifest.private)
      .flatMap((manifest) =>
        Object.keys(manifest.dependencies ?? {})
          .filter((dependency) => privateNames.has(dependency))
          .map((dependency) => `${manifest.name} -> ${dependency}`),
      );

    expect(leaks).toEqual([]);
  });

  it("ships the built Studio inside the published files", () => {
    const manifest = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8")) as {
      files: string[];
    };

    expect(manifest.files).toContain("dist");
    expect(existsSync(join(cliDir, "dist", "studio", "index.html"))).toBe(true);
  });

  it(
    "serves Studio from its own dist, not from a workspace sibling",
    () => {
      const result = spawnSync(
        process.execPath,
        [join(cliDir, "dist", "cli.js"), "readiness", "--json", exampleProject],
        { encoding: "utf8", timeout: CHILD_TIMEOUT_MS },
      );

      const studio = JSON.parse(result.stdout).diagnostics.find(
        (d: { subsystem: string }) => d.subsystem === "studio.assets",
      );
      expect(studio.severity).toBe("ok");
      expect(studio.path).toContain(`${sep}dist${sep}studio`);
    },
    TEST_TIMEOUT_MS,
  );
});
