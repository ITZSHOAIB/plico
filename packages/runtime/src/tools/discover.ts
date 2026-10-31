import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import type { DeclaredTool } from "../types/index.js";
import { loadToolFile } from "./load.js";

export async function discoverToolFiles(project: LoadedProject): Promise<string[]> {
  const projectPaths = getProjectPaths(project.root);
  const entries = (await readdir(projectPaths.directories.tools))
    .filter((entry) => entry.endsWith(".tool.ts"))
    .sort((left, right) => left.localeCompare(right));
  return entries;
}

export async function discoverTools(project: LoadedProject): Promise<DeclaredTool[]> {
  const relativePaths = getProjectRelativePaths();
  const projectPaths = getProjectPaths(project.root);
  const entries = await discoverToolFiles(project);

  const tools: DeclaredTool[] = [];
  for (const entry of entries) {
    const source = `${relativePaths.directories.tools}/${entry}`;
    const tool = await loadToolFile(join(projectPaths.directories.tools, entry), source);
    tools.push(tool);
  }

  return tools;
}
