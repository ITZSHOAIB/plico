import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonSchema, ModelResponse } from "../types/index.js";

export const outputSchema: JsonSchema = {
  type: "object",
  properties: { ticket: { type: "string" } },
  required: ["ticket"],
  additionalProperties: false,
};
export const outputUsage: ModelResponse["usage"] = { inputTokens: 1, outputTokens: 1 };

export async function outputProject(output: unknown = outputSchema): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-output-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    `export default ${JSON.stringify({ schemaVersion: 1, name: "Demo", output })};`,
  );
  await writeFile(join(root, "agent.md"), "# Triage tickets\n");
  return root;
}
