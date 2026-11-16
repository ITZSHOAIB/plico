import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRunMessage, validateProject } from "@plico-ai/core";
import { expect, it } from "vitest";
import { runProject } from "../index.js";

it("accepts Zod input and output schemas declared in plico.config.ts", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-zod-config-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await symlink(
    fileURLToPath(new URL("../../node_modules", import.meta.url)),
    join(root, "node_modules"),
    "junction",
  );
  await writeFile(
    join(root, "plico.config.ts"),
    [
      'import { z } from "zod";',
      "export default {",
      '  schemaVersion: 1, name: "Zod",',
      "  input: z.object({ ticket: z.string() }),",
      '  output: z.object({ priority: z.enum(["low", "high"]) }),',
      "};",
    ].join("\n"),
  );
  await writeFile(join(root, "agent.md"), "Triage.");

  expect((await validateProject(root)).errors).toEqual([]);
  expect(await prepareRunMessage(root, { input: { ticket: 7 } })).toMatchObject({ ok: false });
  const result = await runProject(root, {
    script: [{ type: "assistant.output", content: '{"priority":"high"}' }],
  });
  expect(result).toMatchObject({ status: "completed", structuredOutput: { priority: "high" } });
});
