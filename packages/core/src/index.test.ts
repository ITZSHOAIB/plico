import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, validateProject } from "./index.js";

async function writeValidProject(
  root: string,
  options: { configBody?: string } = {},
) {
  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "artifacts"), { recursive: true });
  await mkdir(join(root, "memory"), { recursive: true });

  await writeFile(
    join(root, "plico.config.ts"),
    options.configBody ?? [
      "export default {",
      "  schemaVersion: 1,",
      '  name: "Internal Ops Agent",',
      '  template: "internal-ops",',
      "} as const;",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    join(root, "agent.md"),
    "# Internal Ops Agent\n\nFollow the project instructions.",
    "utf8",
  );
}

describe("validateProject", () => {
  it("loads a computed config export from plico.config.ts", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await writeValidProject(root, {
      configBody: [
        'const parts = ["Internal", "Ops", "Agent"];',
        'const name = parts.join(" ");',
        "export default {",
        "  schemaVersion: 1,",
        "  name,",
        '  template: "internal-ops",',
        "} as const;",
        "",
      ].join("\n"),
    });

    const project = await loadProject(root);

    expect(project.config.name).toBe("Internal Ops Agent");
    expect(project.config.template).toBe("internal-ops");
  });

  it("rejects a config without a default export", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await writeValidProject(root, {
      configBody: [
        'export const schemaVersion = 1;',
        'export const name = "Internal Ops Agent";',
        "",
      ].join("\n"),
    });

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing default export in plico.config.ts",
          severity: "error",
        }),
      ]),
    );
  });

  it("rejects a malformed default export", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await writeValidProject(root, {
      configBody: [
        'export default "nope";',
        "",
      ].join("\n"),
    });

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Expected default export to be an object",
          severity: "error",
        }),
      ]),
    );
  });

  it("accepts a valid internal-ops project", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await writeValidProject(root);

    const result = await validateProject(root);

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.project?.config.name).toBe("Internal Ops Agent");
  });

  it("rejects a project without plico.config.ts", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await mkdir(join(root, "skills"), { recursive: true });
    await mkdir(join(root, "tools"), { recursive: true });
    await mkdir(join(root, "evals"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await mkdir(join(root, "memory"), { recursive: true });
    await writeFile(join(root, "agent.md"), "# Agent", "utf8");

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required file: plico.config.ts",
          severity: "error",
        }),
      ]),
    );
  });

  it("rejects a config missing required fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await mkdir(join(root, "skills"), { recursive: true });
    await mkdir(join(root, "tools"), { recursive: true });
    await mkdir(join(root, "evals"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await mkdir(join(root, "memory"), { recursive: true });

    await writeFile(
      join(root, "plico.config.ts"),
      ["export default { schemaVersion: 1 } as const;", ""].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "agent.md"), "# Agent", "utf8");

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Missing required field: name",
          severity: "error",
        }),
      ]),
    );
  });

  it("rejects a project without agent.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
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

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "agent.md",
          message: "Missing required file: agent.md",
          severity: "error",
        }),
      ]),
    );
  });

  it("rejects a project missing required directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
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
    await writeFile(join(root, "agent.md"), "# Agent", "utf8");

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "skills",
        "tools",
        "evals",
        "artifacts",
        "memory",
      ]),
    );
  });

  it("rejects unsupported schema versions", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-core-"));
    await mkdir(join(root, "skills"), { recursive: true });
    await mkdir(join(root, "tools"), { recursive: true });
    await mkdir(join(root, "evals"), { recursive: true });
    await mkdir(join(root, "artifacts"), { recursive: true });
    await mkdir(join(root, "memory"), { recursive: true });

    await writeFile(
      join(root, "plico.config.ts"),
      [
        "export default {",
        "  schemaVersion: 2,",
        '  name: "Internal Ops Agent",',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "agent.md"), "# Agent", "utf8");

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plico.config.ts",
          message: "Unsupported schemaVersion. Expected 1.",
          severity: "error",
        }),
      ]),
    );
  });
});
