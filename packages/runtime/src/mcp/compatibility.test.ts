import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { discoverMcpTools, discoverTools, runProject } from "../index.js";
import { project, serverFile, ticket } from "../testing/mcp-project.js";

afterEach(() => vi.unstubAllEnvs());

it("passes explicitly named stdio credentials without inheriting unrelated host secrets", async () => {
  vi.stubEnv("PLICO_MCP_TOKEN", "fixture-token");
  vi.stubEnv("PLICO_MCP_OTHER_SECRET", "unrelated-secret");
  const { root, loaded } = await project({
    docs: {
      transport: "stdio",
      command: process.execPath,
      args: [serverFile],
      tools: ["get_ticket"],
      env: ["PLICO_MCP_TOKEN"],
    },
  });
  await writeFile(
    join(root, "mcp-fixture.json"),
    JSON.stringify({ tools: [ticket], inspectEnv: ["PLICO_MCP_TOKEN", "PLICO_MCP_OTHER_SECRET"] }),
  );
  const tools = await discoverMcpTools(loaded);
  const observed = JSON.parse(await readFile(join(root, "mcp-process.json"), "utf8"));
  expect(observed.env).toEqual({ PLICO_MCP_TOKEN: "fixture-token", PLICO_MCP_OTHER_SECRET: null });
  expect(JSON.stringify(tools)).not.toContain("fixture-token");
});

it("returns no MCP tools for an unconfigured project", async () => {
  const { loaded } = await project({});
  delete loaded.config.mcpServers;
  expect(await discoverMcpTools(loaded)).toEqual([]);
});

it("keeps existing TypeScript discovery and scripted runs independent of MCP connectivity", async () => {
  const { root, loaded } = await project({
    unreachable: {
      transport: "stdio",
      command: "plico-executable-does-not-exist",
      tools: ["read"],
    },
  });
  expect(await discoverTools(loaded)).toEqual([]);
  expect(
    await runProject(root, { script: [{ type: "assistant.output", content: "Offline" }] }),
  ).toMatchObject({ status: "completed", output: "Offline" });
});

it("reports unavailable executables with a source-specific error", async () => {
  const { loaded } = await project({
    unavailable: {
      transport: "stdio",
      command: "plico-executable-does-not-exist",
      tools: [],
    },
  });
  await expect(discoverMcpTools(loaded)).rejects.toThrow(
    /MCP server unavailable.*connection or tool listing failed.*ENOENT/,
  );
});
