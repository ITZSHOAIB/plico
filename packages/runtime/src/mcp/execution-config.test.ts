import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { project } from "../testing/mcp-project.js";

it.each([
  { callTimeoutMs: 0 },
  { callTimeoutMs: -1 },
  { callTimeoutMs: 2_147_483_648 },
  { callTimeoutMs: "500" },
  { callTimeoutMs: 0.5 },
  { replayOnCrash: ["not_allowlisted"] },
  { replayOnCrash: ["read", "read"] },
  { replayOnCrash: true },
])("rejects invalid MCP execution options offline: %j", async (options) => {
  const { root } = await project({});
  await writeFile(
    join(root, "plico.config.ts"),
    `export default ${JSON.stringify({
      schemaVersion: 1,
      name: "Invalid",
      mcpServers: {
        source: {
          transport: "stdio",
          command: "plico-missing-command",
          tools: ["read"],
          ...options,
        },
      },
    })};`,
  );
  const result = await runProject(root, {
    script: [{ type: "assistant.output", content: "offline" }],
  });
  expect(result.status).toBe("failed");
  expect(result.events).toContainEqual(
    expect.objectContaining({
      type: "run.error",
      payload: expect.objectContaining({ phase: "validation" }),
    }),
  );
  expect(JSON.stringify(result.events)).toContain(Object.keys(options)[0]);
});
