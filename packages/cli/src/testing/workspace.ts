import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface WorkspaceManifest {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  description?: string;
  homepage?: string;
  keywords?: string[];
  repository?: unknown;
  publishConfig?: { access?: string };
  /** Directory name under packages/. */
  dir: string;
}

export const packagesDir: string = join(fileURLToPath(new URL("..", import.meta.url)), "..", "..");

export function workspaceManifests(): WorkspaceManifest[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        const manifest = JSON.parse(
          readFileSync(join(packagesDir, entry.name, "package.json"), "utf8"),
        );
        return [{ ...manifest, dir: entry.name }];
      } catch {
        return [];
      }
    });
}

export function publishedManifests(): WorkspaceManifest[] {
  return workspaceManifests().filter((manifest) => !manifest.private);
}
