// Writes a patch changeset when a dependency update changes what a published package ships.
// Usage: node scripts/dependency-changeset.mjs <base-ref> <branch>
// Prints the changeset path, or nothing when only dev, root or unpublished dependencies changed.
// Uses only Node built-ins: CI runs it with a write token on a Dependabot branch, before any install.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [baseRef, branch] = process.argv.slice(2);
if (!baseRef || !branch) {
  console.error("Usage: dependency-changeset.mjs <base-ref> <branch>");
  process.exit(1);
}

// Private packages whose runtime dependencies ship inside a published package's bundle.
const bundledInto = { "@plico-ai/studio": "@plico-ai/cli" };
const shippedFields = ["dependencies", "peerDependencies", "optionalDependencies"];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function readManifest(ref, path) {
  try {
    return JSON.parse(git("show", `${ref}:${path}`));
  } catch {
    return {};
  }
}

function shipped(manifest) {
  const ranges = {};
  for (const field of shippedFields) Object.assign(ranges, manifest[field]);
  return ranges;
}

const manifests = git("ls-files", "packages/*/package.json").split("\n").filter(Boolean);
const releases = new Set();
const changes = new Map();

for (const path of manifests) {
  const head = readManifest("HEAD", path);
  const release = head.private ? bundledInto[head.name] : head.name;
  if (!release) continue;

  const before = shipped(readManifest(baseRef, path));
  const after = shipped(head);
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const [from, to] = [before[name], after[name]];
    if (from === to) continue;
    releases.add(release);
    const change =
      from === undefined
        ? `\`${name}\` added at ${to}`
        : to === undefined
          ? `\`${name}\` removed`
          : `\`${name}\` ${from} → ${to}`;
    changes.set(change, name);
  }
}

if (releases.size > 0) {
  const path = `.changeset/${branch.replace(/[^\w.-]+/g, "-")}.md`;
  const sorted = [...changes].sort(([, a], [, b]) => a.localeCompare(b)).map(([change]) => change);
  const frontmatter = [...releases].sort().map((name) => `"${name}": patch`);
  writeFileSync(
    path,
    ["---", ...frontmatter, "---", "", `Update dependencies: ${sorted.join(", ")}.`, ""].join("\n"),
  );
  console.log(path);
}
