import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths, REQUIRED_PROJECT_DIRECTORIES } from "@plico/core";
import {
  agentFile,
  artifactsReadmeFile,
  configFile,
  memoryReadmeFile,
  projectReadmeFile,
  smokeEvalFile,
  toolsReadmeFile,
  triageSkillFile,
} from "./files.js";
import type { ScaffoldOptions } from "./types.js";

export async function createInternalOpsScaffold(options: ScaffoldOptions): Promise<void> {
  const root = options.targetDir;
  const projectName = options.projectName ?? "Internal Ops Agent";
  const projectPaths = getProjectPaths(root);

  await ensureEmptyTarget(root);

  await mkdir(root, { recursive: true });
  await Promise.all(
    REQUIRED_PROJECT_DIRECTORIES.map((directoryRole) =>
      mkdir(projectPaths.directories[directoryRole], { recursive: true }),
    ),
  );

  await writeFile(projectPaths.configFile, configFile(projectName), "utf8");
  await writeFile(projectPaths.agentFile, agentFile(projectName), "utf8");
  await writeFile(join(projectPaths.directories.skills, "triage.md"), triageSkillFile(), "utf8");
  await writeFile(join(projectPaths.directories.tools, "readme.md"), toolsReadmeFile(), "utf8");
  await writeFile(join(projectPaths.directories.evals, "smoke.md"), smokeEvalFile(), "utf8");
  await writeFile(join(projectPaths.directories.memory, "README.md"), memoryReadmeFile(), "utf8");
  await writeFile(
    join(projectPaths.directories.artifacts, "README.md"),
    artifactsReadmeFile(),
    "utf8",
  );
  await writeFile(join(root, "README.md"), projectReadmeFile(projectName), "utf8");
}

async function ensureEmptyTarget(root: string): Promise<void> {
  try {
    const entries = await readdir(root);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${root}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return;
    }

    if (error instanceof Error && error.message.startsWith("Target directory is not empty")) {
      throw error;
    }

    throw error;
  }
}
