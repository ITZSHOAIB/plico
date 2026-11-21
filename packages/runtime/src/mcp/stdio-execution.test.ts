import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { project, serverFile, ticket } from "../testing/mcp-project.js";

it("calls a stdio tool after approval and shuts down its process", async () => {
  const { root } = await project({
    desk: {
      transport: "stdio",
      command: process.execPath,
      args: [serverFile],
      tools: ["get_ticket"],
    },
  });
  await writeFile(join(root, "mcp-fixture.json"), JSON.stringify({ tools: [ticket] }));
  const result = await runProject(root, {
    script: [
      { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
      { type: "approval.decide", approved: true },
    ],
  });
  expect(result.status).toBe("completed");
  const calls = (await readFile(join(root, "mcp-calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(calls).toMatchObject([{ name: "get_ticket", arguments: { id: "42" } }]);
  const { pid } = JSON.parse(await readFile(join(root, "mcp-process.json"), "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
});
