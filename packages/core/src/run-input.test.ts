import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareRunMessage } from "./index.js";

async function project(frontmatter: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-run-input-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Agent" };',
  );
  await writeFile(join(root, "agent.md"), `${frontmatter}# Agent\n\nHelp.\n`);
  return root;
}

const typed = [
  "---",
  "input:",
  "  type: object",
  "  required: [ticket]",
  "  properties:",
  "    ticket:",
  "      type: string",
  "---",
  "",
].join("\n");

describe("prepareRunMessage", () => {
  it("passes content through when the agent declares no input schema", async () => {
    const root = await project("");

    expect(await prepareRunMessage(root, { content: "hello" })).toEqual({
      ok: true,
      message: "hello",
    });
  });

  it("rejects input for an agent that declares no schema", async () => {
    const root = await project("");

    const result = await prepareRunMessage(root, { content: "hello", input: { a: 1 } });

    expect(result).toEqual({ ok: false, errors: [expect.stringContaining("no input schema")] });
  });

  it("requires input when a schema is declared", async () => {
    const result = await prepareRunMessage(await project(typed), { content: "hello" });

    expect(result).toEqual({ ok: false, errors: [expect.stringContaining("input is required")] });
  });

  it("lists each schema violation with its path", async () => {
    const result = await prepareRunMessage(await project(typed), { input: { ticket: 7 } });

    expect(result).toEqual({
      ok: false,
      errors: [expect.stringContaining("ticket: expected string")],
    });
  });

  it("uses the JSON input as the message when there is no content", async () => {
    const result = await prepareRunMessage(await project(typed), { input: { ticket: "T-1" } });

    expect(result).toEqual({ ok: true, message: JSON.stringify({ ticket: "T-1" }, null, 2) });
  });

  it("appends the JSON input to content when both are given", async () => {
    const result = await prepareRunMessage(await project(typed), {
      content: "Triage this.",
      input: { ticket: "T-1" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.message).toContain("Triage this.");
    expect(result.ok && result.message).toContain('"ticket": "T-1"');
  });
});
