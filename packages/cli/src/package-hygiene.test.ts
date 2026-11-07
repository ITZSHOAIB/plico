import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packagesDir, publishedManifests } from "./testing/workspace.js";

// These check what npm would publish. `pnpm build` comes before `pnpm test`.
function distFiles(dir: string): string[] {
  const dist = join(packagesDir, dir, "dist");
  return readdirSync(dist, { recursive: true, encoding: "utf8" }).map((file) =>
    file.replaceAll("\\", "/"),
  );
}

describe("published package hygiene", () => {
  it("ships no test files, test helpers or source maps in dist", () => {
    const stray = publishedManifests().flatMap((manifest) =>
      distFiles(manifest.dir)
        .filter((file) => /\.test\.|(^|\/)testing\/|\.map$/.test(file))
        .map((file) => `${manifest.name}: ${file}`),
    );

    expect(stray).toEqual([]);
  });

  it("describes itself to npm", () => {
    const missing = publishedManifests().flatMap((manifest) =>
      (["description", "homepage", "keywords", "repository"] as const)
        .filter((field) => !manifest[field])
        .map((field) => `${manifest.name}: ${field}`),
    );

    expect(missing).toEqual([]);
  });

  it("publishes publicly", () => {
    const restricted = publishedManifests()
      .filter((manifest) => manifest.publishConfig?.access !== "public")
      .map((manifest) => manifest.name);

    expect(restricted).toEqual([]);
  });

  it("has a README", () => {
    const missing = publishedManifests()
      .filter((manifest) => !existsSync(join(packagesDir, manifest.dir, "README.md")))
      .map((manifest) => manifest.name);

    expect(missing).toEqual([]);
  });
});
