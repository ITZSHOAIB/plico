import { join } from "node:path";
import type {
  ProjectDirectoryRole,
  ProjectLayout,
  ProjectPaths,
  ProjectRelativePaths,
} from "./types.js";

export const PROJECT_LAYOUT: ProjectLayout = {
  configFile: "plico.config.ts",
  agentFile: "agent.md",
  directories: {
    skills: "skills",
    tools: "tools",
    evals: "evals",
    artifacts: "artifacts",
    memory: "memory",
  },
};

export const REQUIRED_PROJECT_DIRECTORIES: readonly ProjectDirectoryRole[] = [
  "skills",
  "tools",
  "evals",
  "artifacts",
  "memory",
];

export function getProjectRelativePaths(): ProjectRelativePaths {
  return {
    configFile: PROJECT_LAYOUT.configFile,
    agentFile: PROJECT_LAYOUT.agentFile,
    directories: { ...PROJECT_LAYOUT.directories },
  };
}

export function getProjectPaths(root: string): ProjectPaths {
  const relative = getProjectRelativePaths();

  return {
    configFile: join(root, relative.configFile),
    agentFile: join(root, relative.agentFile),
    directories: {
      skills: join(root, relative.directories.skills),
      tools: join(root, relative.directories.tools),
      evals: join(root, relative.directories.evals),
      artifacts: join(root, relative.directories.artifacts),
      memory: join(root, relative.directories.memory),
    },
  };
}
