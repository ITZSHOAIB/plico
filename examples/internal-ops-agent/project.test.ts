import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "../../packages/core/src/index.js";

describe("internal-ops-agent example", () => {
  it("validates as a Plico project", async () => {
    const result = await validateProject("examples/internal-ops-agent");

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(
      await readFile(join("examples/internal-ops-agent", "memory", "README.md"), "utf8"),
    ).toContain("durable project notes");
    expect(
      await readFile(join("examples/internal-ops-agent", "artifacts", "README.md"), "utf8"),
    ).toContain("generated outputs");
  });
});
