import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// Runs the built CLI against projects that import `plico`, in a temp folder with no node_modules
// above it, the way a globally installed `plico` meets a freshly scaffolded project.
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const CHILD_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 45_000;
const roots: string[] = [];

const CONFIG = `import { defineConfig } from "plico";

export default defineConfig({ schemaVersion: 1, name: "Typed", template: "internal-ops" });
`;

function tool(name: string): string {
  return `import { defineTool } from "plico";

export default defineTool({
  name: "${name}",
  description: "Echo a message.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
    additionalProperties: false,
  },
  capabilities: [],
  approval: { required: false },
  handler: async (input) => ({ echoed: input.message }),
});
`;
}

function project(
  tools: Record<string, string>,
  packageType: "module" | "commonjs" = "module",
): string {
  const root = mkdtempSync(join(tmpdir(), "plico-authoring-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: packageType }));
  writeFileSync(join(root, "agent.md"), "# Typed\n\nAnswer briefly.\n");
  writeFileSync(join(root, "plico.config.ts"), CONFIG);
  for (const directory of ["skills", "tools", "evals", "artifacts", "memory"]) {
    mkdirSync(join(root, directory));
  }
  for (const [file, source] of Object.entries(tools)) {
    writeFileSync(join(root, "tools", file), source);
  }
  return root;
}

function plico(...args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    timeout: CHILD_TIMEOUT_MS,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("typed authoring helpers", () => {
  it(
    "validates and runs a project whose config and tool import plico",
    () => {
      const root = project({ "echo.tool.ts": tool("echo") });

      const validated = plico("validate", root);
      expect(validated.output).toContain("Valid Plico project");
      expect(validated.status).toBe(0);

      const run = plico("run", "--dry", root);
      expect(run.output).toContain("tools.discovered: 1 tool(s)");
      expect(run.status).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "loads a tool from a CommonJS project",
    () => {
      const root = project({ "echo.tool.ts": tool("echo") }, "commonjs");

      const run = plico("run", "--dry", root);

      expect(run.output).toContain("tools.discovered: 1 tool(s)");
      expect(run.status).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reports a duplicate name when the tool is defined first and exported after",
    () => {
      const named = tool("echo").replace("export default defineTool", "const echo = defineTool");
      const root = project({
        "a.tool.ts": `${named}\nexport default echo;\n`,
        "b.tool.ts": tool("echo"),
      });

      const validated = plico("validate", root);

      expect(validated.output).toMatch(/duplicate/i);
      expect(validated.status).not.toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reports a duplicate tool name declared through defineTool",
    () => {
      const root = project({ "a.tool.ts": tool("echo"), "b.tool.ts": tool("echo") });

      const validated = plico("validate", root);

      expect(validated.output).toMatch(/duplicate/i);
      expect(validated.status).not.toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
