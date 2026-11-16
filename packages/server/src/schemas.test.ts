import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createPlico } from "./index.js";

const output = { type: "object", properties: { ticket: { type: "string" } } };
const input = { type: "object", required: ["ticket"], properties: { ticket: { type: "string" } } };

async function project(agent: string, config: Record<string, unknown> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-schemas-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default ${JSON.stringify({ schemaVersion: 1, name: "Schemas", ...config })};`,
  );
  await writeFile(join(root, "agent.md"), agent);
  return root;
}

it("serves the agent's input and output schemas, with agent.md winning over config", async () => {
  const root = await project(
    [
      "---",
      "input:",
      "  type: object",
      "  required: [ticket]",
      "  properties:",
      "    ticket:",
      "      type: string",
      "---",
      "Triage.",
    ].join("\n"),
    { input: { type: "string" }, output },
  );
  const plico = await createPlico({ projectRoot: root, databasePath: join(root, "state.sqlite") });
  try {
    const host = await plico.fetch()(new Request("https://app.example/v1/schemas"));
    expect(host.status).toBe(200);
    expect(await host.json()).toEqual({ input, output });

    // Clients of a scoped mount send typed input too, so they can discover its shape.
    const scoped = plico.fetch({ scope: () => ({ userId: "ann" }) });
    const response = await scoped(new Request("https://app.example/v1/schemas"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ input, output });
  } finally {
    await plico.close();
  }
});

it("serves an empty object when the agent declares no schemas", async () => {
  const root = await project("Answer briefly.");
  const plico = await createPlico({ projectRoot: root, databasePath: join(root, "state.sqlite") });
  try {
    const response = await plico.fetch()(new Request("https://app.example/v1/schemas"));
    expect(await response.json()).toEqual({});
  } finally {
    await plico.close();
  }
});
