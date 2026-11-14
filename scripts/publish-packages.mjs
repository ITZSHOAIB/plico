// Publishes every public package whose version is not on npm yet, dependencies first. Run after
// `pnpm build`. Safe to run again after a partial failure: versions already on the registry are
// skipped. Set PLICO_PUBLISH_DRY_RUN=1 to pack and validate each package without publishing.
//
// `pnpm pack` writes the tarball, because it replaces `workspace:*` with the real version. `npm`
// publishes it, because trusted publishing (OIDC, no stored token) needs npm 11.5.1 or later.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";
const dryRun = process.env.PLICO_PUBLISH_DRY_RUN === "1";

/** Runs a package-manager command; on Windows its `.cmd` shim needs a shell. */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    shell: windows,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function publicPackages() {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, "packages", entry.name))
    .map((directory) => ({
      directory,
      manifest: JSON.parse(readFileSync(join(directory, "package.json"), "utf8")),
    }))
    .filter(({ manifest }) => !manifest.private);
}

/** Orders packages so each comes after the workspace packages it depends on. */
function dependenciesFirst(packages) {
  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  const ordered = [];
  const visit = (entry) => {
    if (ordered.includes(entry)) return;
    const { dependencies = {}, peerDependencies = {} } = entry.manifest;
    for (const name of Object.keys({ ...dependencies, ...peerDependencies })) {
      if (byName.has(name)) visit(byName.get(name));
    }
    ordered.push(entry);
  };
  packages.forEach(visit);
  return ordered;
}

/** True when the registry already has this version. Only a 404 means "not yet"; anything else is an error. */
function onRegistry(name, version, execute) {
  try {
    return (
      execute("npm", [
        "view",
        `${name}@${version}`,
        "version",
        "--registry=https://registry.npmjs.org",
      ]).trim() === version
    );
  } catch (error) {
    if (String(error.stderr).includes("E404")) return false;
    throw error;
  }
}

export async function publishPackages({
  packages = publicPackages(),
  execute = run,
  dry = dryRun,
} = {}) {
  if (new Set(packages.map(({ manifest }) => manifest.version)).size !== 1) {
    throw new Error("All public packages must share one version before publishing.");
  }
  // Dry runs must inspect every tarball, even when the version is already on npm.
  const pending = dry
    ? packages
    : packages.filter(({ manifest }) => !onRegistry(manifest.name, manifest.version, execute));
  const work = await mkdtemp(join(tmpdir(), "plico-publish-"));
  try {
    let published = 0;
    for (const { directory, manifest } of dependenciesFirst(pending)) {
      const { name, version } = manifest;
      execute("pnpm", ["pack", "--pack-destination", work], { cwd: directory });
      const tarball = join(work, `${name.replace("@", "").replace("/", "-")}-${version}.tgz`);
      // A prerelease must not become the version `npm install` picks.
      const tag = version.includes("-") ? "next" : "latest";
      const args = [
        "publish",
        tarball,
        "--access",
        "public",
        "--tag",
        tag,
        "--registry=https://registry.npmjs.org",
      ];
      // Newer npm checks registry version collisions even in dry runs. Force only that
      // simulation so released tarballs are inspected; never relax real publish checks.
      if (dry) args.push("--dry-run", "--force");
      execute("npm", args, { cwd: root, stdio: "inherit" });
      console.log(`${dry ? "dry run: would publish" : "published"} ${name}@${version} (${tag})`);
      published += 1;
    }
    console.log(
      `${published} package${published === 1 ? "" : "s"} ${dry ? "ready" : "published"}; ${packages.length - pending.length} already on npm.`,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publishPackages();
}
