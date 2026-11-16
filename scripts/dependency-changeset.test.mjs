import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("./dependency-changeset.mjs", import.meta.url));
const changesetPath = ".changeset/dependabot-npm_and_yarn-weekly-1a2b.md";
let root;

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function writeManifest(dir, manifest) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function run() {
  return spawnSync(
    process.execPath,
    [script, git("rev-parse", "HEAD~1"), "dependabot/npm_and_yarn/weekly-1a2b"],
    { cwd: root, encoding: "utf8" },
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "plico-dependency-changeset-"));
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  mkdirSync(join(root, ".changeset"));
  writeManifest(".", { name: "root", private: true, devDependencies: { vite: "8.1.1" } });
  writeManifest("packages/server", {
    name: "@plico-ai/server",
    dependencies: { hono: "4.13.17" },
    devDependencies: { tsx: "4.22.4" },
  });
  writeManifest("packages/runtime", {
    name: "@plico-ai/runtime",
    peerDependencies: { ai: "^7.0.162" },
  });
  writeManifest("packages/studio", {
    name: "@plico-ai/studio",
    private: true,
    dependencies: { react: "^19.1.0" },
  });
  writeManifest("packages/docs", {
    name: "@plico-ai/docs",
    private: true,
    dependencies: { next: "16.4.2" },
  });
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it("writes a patch changeset for published packages whose shipped dependencies changed", () => {
  writeManifest("packages/server", {
    name: "@plico-ai/server",
    dependencies: { hono: "4.13.18" },
    devDependencies: { tsx: "4.22.4" },
  });
  writeManifest("packages/runtime", {
    name: "@plico-ai/runtime",
    peerDependencies: { ai: "^7.0.170" },
  });
  git("commit", "--quiet", "-am", "bump");

  const result = run();

  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(changesetPath);
  expect(readFileSync(join(root, changesetPath), "utf8")).toBe(
    [
      "---",
      '"@plico-ai/runtime": patch',
      '"@plico-ai/server": patch',
      "---",
      "",
      "Update dependencies: `ai` ^7.0.162 → ^7.0.170, `hono` 4.13.17 → 4.13.18.",
      "",
    ].join("\n"),
  );
});

it("releases the CLI when the Studio it bundles changes a runtime dependency", () => {
  writeManifest("packages/studio", {
    name: "@plico-ai/studio",
    private: true,
    dependencies: { react: "^19.3.1" },
  });
  git("commit", "--quiet", "-am", "bump");

  run();

  expect(readFileSync(join(root, changesetPath), "utf8")).toContain('"@plico-ai/cli": patch');
});

it("writes nothing when only dev, root or unpublished package dependencies changed", () => {
  writeManifest(".", { name: "root", private: true, devDependencies: { vite: "8.1.6" } });
  writeManifest("packages/server", {
    name: "@plico-ai/server",
    dependencies: { hono: "4.13.17" },
    devDependencies: { tsx: "4.23.15" },
  });
  writeManifest("packages/docs", {
    name: "@plico-ai/docs",
    private: true,
    dependencies: { next: "16.4.6" },
  });
  git("commit", "--quiet", "-am", "bump");

  const result = run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe("");
  expect(existsSync(join(root, changesetPath))).toBe(false);
});

it("treats an added or removed shipped dependency as a change", () => {
  writeManifest("packages/server", {
    name: "@plico-ai/server",
    dependencies: { hono: "4.13.17", diff: "9.0.0" },
    devDependencies: { tsx: "4.22.4" },
  });
  git("commit", "--quiet", "-am", "add");

  run();

  expect(readFileSync(join(root, changesetPath), "utf8")).toContain("`diff` added at 9.0.0");
});
