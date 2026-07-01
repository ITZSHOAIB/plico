import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProjectPaths, validateProject } from "@plico/core";
import { runProject } from "@plico/runtime";
import { describe, expect, it } from "vitest";
import { createInternalOpsScaffold } from "./index.js";

describe("createInternalOpsScaffold", () => {
  it("creates a valid internal-ops scaffold", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root });

    const projectPaths = getProjectPaths(root);
    const result = await validateProject(root);
    const configText = await readFile(projectPaths.configFile, "utf8");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(configText).toContain('template: "internal-ops"');
    expect(await readFile(join(projectPaths.directories.skills, "triage.md"), "utf8")).toContain(
      "smallest safe next step",
    );
    expect(await readFile(join(projectPaths.directories.tools, "readme.md"), "utf8")).toContain(
      "file-first",
    );
    expect(await readFile(join(projectPaths.directories.evals, "smoke.md"), "utf8")).toContain(
      "validates",
    );
    expect(await readFile(join(projectPaths.directories.memory, "README.md"), "utf8")).toContain(
      "durable project notes",
    );
    expect(await readFile(join(projectPaths.directories.artifacts, "README.md"), "utf8")).toContain(
      "generated outputs",
    );
    expect(await readFile(join(root, "README.md"), "utf8")).toContain(
      "Canonical internal-ops starter project",
    );
  });

  it("refuses to overwrite a non-empty target directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await mkdir(join(root, "existing"), { recursive: true });
    await writeFile(join(root, "existing", "marker.txt"), "keep me", "utf8");

    await expect(createInternalOpsScaffold({ targetDir: join(root, "existing") })).rejects.toThrow(
      "Target directory is not empty",
    );
  });

  it("completes a default dry run for a generated scaffold", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root });

    const result = await runProject(root);

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Dry run complete for Internal Ops Agent.");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "assistant.output",
      "run.completed",
    ]);
  });
});
