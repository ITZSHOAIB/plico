import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths, getProjectRelativePaths, type LoadedProject } from "@plico/core";
import type { DeclaredTool } from "../types/index.js";
import { loadToolFile } from "./load.js";

export async function discoverToolFiles(project: LoadedProject): Promise<string[]> {
  const projectPaths = getProjectPaths(project.root);
  const entries = (await readdir(projectPaths.directories.tools, { withFileTypes: true }))
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".tool.ts"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return entries;
}

export async function discoverTools(project: LoadedProject): Promise<DeclaredTool[]> {
  const relativePaths = getProjectRelativePaths();
  const projectPaths = getProjectPaths(project.root);
  const entries = await discoverToolFiles(project);

  const tools: DeclaredTool[] = [];
  const sources = new Map<string, string>();
  for (const entry of entries) {
    const source = `${relativePaths.directories.tools}/${entry}`;
    const tool = await loadToolFile(join(projectPaths.directories.tools, entry), source);
    const first = sources.get(tool.name);
    if (first) {
      throw new Error(`Duplicate tool name "${tool.name}" declared in ${first} and ${source}`);
    }
    sources.set(tool.name, source);
    tools.push(tool);
  }

  return tools;
}
