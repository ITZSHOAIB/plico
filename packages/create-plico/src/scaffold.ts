import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths, REQUIRED_PROJECT_DIRECTORIES } from "@plico-ai/core";
import {
  agentFile,
  artifactsReadmeFile,
  configFile,
  envExampleFile,
  gitignoreFile,
  memoryReadmeFile,
  packageFile,
  projectAgentsFile,
  projectClaudeFile,
  projectReadmeFile,
  smokeEvalFile,
  toolsReadmeFile,
  triageSkillFile,
} from "./files.js";
import type { ScaffoldOptions } from "./types.js";
import { readVersion } from "./usage.js";

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

  await writeFile(projectPaths.configFile, configFile(projectName, options.provider), "utf8");
  await writeFile(join(root, "package.json"), packageFile(readVersion(), options.provider), "utf8");
  await writeFile(join(root, ".env.example"), envExampleFile(options.provider), "utf8");
  await writeFile(join(root, ".gitignore"), gitignoreFile(), "utf8");
  await writeFile(projectPaths.agentFile, agentFile(projectName), "utf8");
  await mkdir(join(projectPaths.directories.skills, "triage"), { recursive: true });
  await writeFile(
    join(projectPaths.directories.skills, "triage", "SKILL.md"),
    triageSkillFile(),
    "utf8",
  );
  await writeFile(join(projectPaths.directories.tools, "readme.md"), toolsReadmeFile(), "utf8");
  await writeFile(
    join(projectPaths.directories.evals, "smoke.script.json"),
    smokeEvalFile(),
    "utf8",
  );
  await writeFile(join(projectPaths.directories.memory, "README.md"), memoryReadmeFile(), "utf8");
  await writeFile(
    join(projectPaths.directories.artifacts, "README.md"),
    artifactsReadmeFile(),
    "utf8",
  );
  await writeFile(join(root, "README.md"), projectReadmeFile(projectName), "utf8");
  await writeFile(join(root, "AGENTS.md"), projectAgentsFile(projectName), "utf8");
  await writeFile(join(root, "CLAUDE.md"), projectClaudeFile(), "utf8");
}

async function ensureEmptyTarget(root: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (entries.length > 0) throw new Error(`Target directory is not empty: ${root}`);
}
