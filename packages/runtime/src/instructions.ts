import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import type { ComposedInstructions } from "./types.js";

export async function composeInstructions(project: LoadedProject): Promise<ComposedInstructions> {
  const relativePaths = getProjectRelativePaths();
  const projectPaths = getProjectPaths(project.root);
  const sources = [relativePaths.agentFile];
  const parts = [await readFile(projectPaths.agentFile, "utf8")];
  const skillNames = (await readdir(projectPaths.directories.skills))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  for (const skillName of skillNames) {
    const source = `${relativePaths.directories.skills}/${skillName}`;
    sources.push(source);
    parts.push(await readFile(join(projectPaths.directories.skills, skillName), "utf8"));
  }

  return {
    sources,
    content: parts.map((part) => part.trimEnd()).join("\n\n"),
  };
}
