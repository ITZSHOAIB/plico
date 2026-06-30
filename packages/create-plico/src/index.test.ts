import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInternalOpsScaffold } from "./index.js";
import { validateProject } from "@plico/core";

describe("createInternalOpsScaffold", () => {
  it("creates a valid internal-ops scaffold", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root });

    const result = await validateProject(root);
    const configText = await readFile(join(root, "plico.config.ts"), "utf8");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(configText).toContain('template: "internal-ops"');
    expect(await readFile(join(root, "skills", "triage.md"), "utf8")).toContain("Triage");
  });

  it("refuses to overwrite a non-empty target directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await mkdir(join(root, "existing"), { recursive: true });
    await writeFile(join(root, "existing", "marker.txt"), "keep me", "utf8");

    await expect(createInternalOpsScaffold({ targetDir: join(root, "existing") })).rejects.toThrow(
      "Target directory is not empty",
    );
  });
});
