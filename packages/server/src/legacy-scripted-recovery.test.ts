import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createPlico } from "./index.js";

function post(path: string, body: unknown): Request {
  return new Request(`https://app.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("scripted runs journaled before tool mocking", () => {
  it("never runs the real handler after a restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-legacy-script-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir), { recursive: true });
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Legacy" };',
    );
    await writeFile(join(root, "agent.md"), "Help.");
    const marker = join(root, "handler-ran.txt");
    await writeFile(
      join(root, "tools", "touch.tool.ts"),
      `import { writeFileSync } from "node:fs";
export default {
  name: "touch",
  description: "Writes a marker file.",
  inputSchema: { type: "object" },
  capabilities: [],
  approval: { required: true },
  handler: async () => { writeFileSync(${JSON.stringify(marker)}, "ran"); return {}; },
};`,
    );
    const databasePath = join(root, "state.sqlite");

    const first = await createPlico({ projectRoot: root, databasePath });
    const response = await first.fetch({ allowScript: true })(
      post("/v1/runs", {
        script: [{ type: "tool.call", toolName: "touch", arguments: {}, result: {} }],
      }),
    );
    const { runId } = (await response.json()) as { runId: string };
    await vi.waitFor(async () => expect((await first.runs.get(runId))?.status).toBe("waiting"));
    await first.close();

    // An older version journaled scripted runs without recording whether their tools may run.
    const database = new DatabaseSync(databasePath);
    const row = database
      .prepare("SELECT input_json FROM engine_runs WHERE run_id = ?")
      .get(runId) as {
      input_json: string;
    };
    const { mockTools: _mockTools, ...legacy } = JSON.parse(row.input_json) as Record<
      string,
      unknown
    >;
    database
      .prepare("UPDATE engine_runs SET input_json = ? WHERE run_id = ?")
      .run(JSON.stringify(legacy), runId);
    database.close();

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = await createPlico({ projectRoot: root, databasePath });
    try {
      await second
        .fetch({ allowScript: true })(
          post(`/v1/runs/${runId}/signal`, {
            name: `approval:${runId}:0`,
            value: { approved: true },
          }),
        )
        .catch(() => undefined);

      await vi.waitFor(async () => expect((await second.runs.get(runId))?.status).toBe("failed"));
      expect(existsSync(marker)).toBe(false);
    } finally {
      await second.close();
      errors.mockRestore();
    }
  });
});
