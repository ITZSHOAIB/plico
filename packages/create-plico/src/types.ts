import type { ScaffoldProvider } from "./providers.js";

export interface ScaffoldOptions {
  targetDir: string;
  projectName?: string;
  /** The model provider to configure. Without one the project has no model and runs `--dry`. */
  provider?: ScaffoldProvider;
}
