import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function writeApprovalProject(root: string) {
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Ops" } as const;\n',
    "utf8",
  );
  await writeFile(join(root, "agent.md"), "# Agent\n\nHelp.\n", "utf8");
  await writeFile(
    join(root, "tools", "delete-ticket.tool.ts"),
    [
      "export default {",
      '  name: "delete_ticket",',
      '  description: "Delete a ticket.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      "  capabilities: [],",
      '  approval: { required: true, reason: "Deletes records." },',
      "  handler: async () => ({ ok: true }),",
      "} as const;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "waiting.script.json"),
    JSON.stringify([{ type: "tool.call", toolName: "delete_ticket", arguments: {} }]),
    "utf8",
  );
}

describe("command help", () => {
  it("prints only that command's usage for --help", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "serve", "--help"]);

    expect(exitCode).toBe(0);
    const lines = logSpy.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("plico serve");
  });

  it("lists every form of a command that has several", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["node", "plico", "run", "-h"]);

    expect(logSpy.mock.calls.map(([line]) => String(line))).toHaveLength(2);
  });
});

describe("serve when the port is taken", () => {
  it("names the port and suggests --port", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeApprovalProject(root);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const exitCode = await main(["node", "plico", "serve", "--port", String(port), root]);

      expect(exitCode).toBe(1);
      const message = errorSpy.mock.calls.map(([line]) => String(line)).join("\n");
      expect(message).toContain(`Port ${port} is already in use`);
      expect(message).toContain("--port");
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});

describe("waiting dry runs", () => {
  it("print the persisted run id", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeApprovalProject(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main([
      "node",
      "plico",
      "run",
      "--dry",
      "--persist",
      "--script",
      join(root, "waiting.script.json"),
      root,
    ]);

    expect(exitCode).toBe(2);
    const output = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map(([line]) => String(line))
      .join("\n");
    expect(output).toMatch(/Persisted run ID: run-/);
  });

  it("say how to keep the run when --persist is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeApprovalProject(root);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await main([
      "node",
      "plico",
      "run",
      "--dry",
      "--script",
      join(root, "waiting.script.json"),
      root,
    ]);

    expect(errorSpy.mock.calls.map(([line]) => String(line))).toContain(
      "Not saved. Add --persist to keep this run and read it with plico events.",
    );
  });
});

describe("scripts with an approval decision", () => {
  it("runs an eval-shaped file passed to --script and approves in the script", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-cli-"));
    await writeApprovalProject(root);
    const file = join(root, "approved.script.json");
    await writeFile(
      file,
      JSON.stringify({
        description: "Approve then finish.",
        script: [
          { type: "tool.call", toolName: "delete_ticket", arguments: {}, result: { ok: true } },
          { type: "approval.decide", approved: true },
          { type: "assistant.output", content: "Deleted." },
        ],
        expect: { status: "completed" },
      }),
      "utf8",
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await main(["node", "plico", "run", "--dry", "--script", file, root]);

    expect(exitCode).toBe(0);
  });
});
