import { describe, expect, it } from "vitest";
import { validateProject } from "../../packages/core/src/index.js";

describe("internal-ops-agent example", () => {
  it("validates as a Plico project", async () => {
    const result = await validateProject("examples/internal-ops-agent");

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
