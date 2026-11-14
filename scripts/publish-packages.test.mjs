import { expect, it, vi } from "vitest";
import { publishPackages } from "./publish-packages.mjs";

const packages = [
  { directory: "contracts", manifest: { name: "@plico-ai/contracts", version: "0.1.2" } },
  {
    directory: "sdk",
    manifest: {
      name: "@plico-ai/sdk",
      version: "0.1.2",
      dependencies: { "@plico-ai/contracts": "workspace:*" },
    },
  },
];

it("dry-runs every tarball, including released versions, without registry queries", async () => {
  const execute = vi.fn(() => "0.1.2");
  await publishPackages({ packages, execute, dry: true });
  const commands = execute.mock.calls.map(([command, args]) => [command, ...args]);
  expect(commands.filter(([, operation]) => operation === "view")).toHaveLength(0);
  expect(commands.filter(([, operation]) => operation === "pack")).toHaveLength(2);
  expect(commands.filter(([, operation]) => operation === "publish")).toHaveLength(2);
  for (const command of commands.filter(([, operation]) => operation === "publish")) {
    expect(command).toContain("--dry-run");
    expect(command).toContain("--force");
  }
});

it("skips published versions during recovery", async () => {
  const execute = vi.fn((_command, args) => {
    if (args[0] === "view") {
      if (args[1].startsWith("@plico-ai/contracts")) return "0.1.2";
      throw Object.assign(new Error("not found"), { stderr: "npm error E404" });
    }
    return "";
  });
  await publishPackages({ packages, execute, dry: false });
  const publishes = execute.mock.calls.filter(([, args]) => args[0] === "publish");
  expect(publishes).toHaveLength(1);
  expect(publishes[0][1][1]).toContain("plico-ai-sdk-0.1.2.tgz");
  expect(publishes[0][1]).not.toContain("--dry-run");
  expect(publishes[0][1]).not.toContain("--force");
});

it("aborts before any publishing when a registry check fails", async () => {
  const execute = vi.fn((_command, args) => {
    if (args[1].startsWith("@plico-ai/contracts")) {
      throw Object.assign(new Error("not found"), { stderr: "E404" });
    }
    throw Object.assign(new Error("registry unavailable"), { stderr: "E503" });
  });
  await expect(publishPackages({ packages, execute, dry: false })).rejects.toThrow(
    "registry unavailable",
  );
  expect(execute.mock.calls.every(([, args]) => args[0] === "view")).toBe(true);
});

it("rejects mismatched public package versions before doing any work", async () => {
  const execute = vi.fn();
  await expect(
    publishPackages({
      packages: [...packages, { directory: "cli", manifest: { name: "cli", version: "0.1.3" } }],
      execute,
      dry: true,
    }),
  ).rejects.toThrow("share one version");
  expect(execute).not.toHaveBeenCalled();
});
