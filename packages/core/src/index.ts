export { loadProject } from "./config.js";
export {
  getProjectPaths,
  getProjectRelativePaths,
  PROJECT_LAYOUT,
  REQUIRED_PROJECT_DIRECTORIES,
} from "./layout.js";
export type {
  LoadedProject,
  ProjectConfig,
  ProjectDirectoryRole,
  ProjectLayout,
  ProjectLayoutDirectories,
  ProjectPaths,
  ProjectRelativePaths,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
} from "./types.js";
export { validateProject } from "./validation.js";
