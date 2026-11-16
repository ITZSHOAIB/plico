import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadProject, validateProject } from "./index.js";

async function project(config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-config-imports-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, "agent.md"), "Triage.");
  await writeFile(join(root, "plico.config.ts"), config);
  return root;
}

it("loads a config that imports a local TypeScript module and an installed package", async () => {
  const root = await project(
    [
      'import { ticket } from "./schemas/ticket.ts";',
      'import { wrap } from "shapes";',
      'export default { schemaVersion: 1, name: "Imports", input: wrap(ticket) };',
    ].join("\n"),
  );
  await mkdir(join(root, "schemas"));
  await writeFile(
    join(root, "schemas", "ticket.ts"),
    'export const ticket: Record<string, unknown> = { type: "string" };\n',
  );
  // An ESM-only package: resolvable through the "import" condition only.
  const pkg = join(root, "node_modules", "shapes");
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, "package.json"),
    JSON.stringify({ name: "shapes", type: "module", exports: { ".": { import: "./index.js" } } }),
  );
  await writeFile(
    join(pkg, "index.js"),
    'export const wrap = (value) => ({ type: "object", properties: { ticket: value } });\n',
  );

  const result = await validateProject(root);

  expect(result.errors).toEqual([]);
  expect(result.project?.config.input).toEqual({
    type: "object",
    properties: { ticket: { type: "string" } },
  });
});

it("reads a changed imported module on the next load", async () => {
  const root = await project(
    'import { name } from "./name.ts";\nexport default { schemaVersion: 1, name };\n',
  );
  await writeFile(join(root, "name.ts"), 'export const name = "First";\n');
  expect((await loadProject(root)).config.name).toBe("First");

  await writeFile(join(root, "name.ts"), 'export const name = "Second";\n');
  expect((await loadProject(root)).config.name).toBe("Second");
});

it("reports an import the config cannot resolve", async () => {
  const root = await project(
    'import "missing-package";\nexport default { schemaVersion: 1, name: "X" };\n',
  );

  const result = await validateProject(root);

  expect(result.ok).toBe(false);
  expect(result.errors.map((issue) => issue.message).join("\n")).toContain("missing-package");
});
