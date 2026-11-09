// Packs every published package, installs the tarballs into an empty project, and runs the
// commands a new user would. Build first (`pnpm build`): `pnpm pack` takes whatever is in `dist`.
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";

/** Runs a package-manager command; on Windows its `.cmd` shim needs a shell. */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    shell: windows,
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
}

function publishedPackages() {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, "packages", entry.name))
    .map((directory) => ({
      directory,
      manifest: JSON.parse(readFileSync(join(directory, "package.json"), "utf8")),
    }))
    .filter(({ manifest }) => !manifest.private);
}

function check(condition, message) {
  if (!condition) throw new Error(`Smoke test failed: ${message}`);
  console.log(`ok - ${message}`);
}

const readyTimeoutMs = Number(process.env.PLICO_SMOKE_READY_TIMEOUT_MS ?? 30_000);

/** Resolves with the server URL, or fails with the output captured so far. */
async function waitForServing(server) {
  let output = "";
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`Server not ready after ${readyTimeoutMs}ms. Output so far: ${output}`)),
      readyTimeoutMs,
    );
  });
  const ready = (async () => {
    for await (const chunk of server.stdout) {
      output += chunk;
      const match = /Serving Plico at (http:\/\/\S+)/.exec(output);
      if (match) return match[1];
    }
    throw new Error(`Server exited before it was ready. Output so far: ${output}`);
  })();
  try {
    return await Promise.race([ready, deadline]);
  } finally {
    clearTimeout(timer);
    ready.catch(() => {});
  }
}

/** Fetches the scripts and stylesheets the Studio page loads and checks they are real assets. */
async function checkStudioAssets(base, html) {
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => /\.(?:js|css)(?:\?|$)/.test(ref));
  check(
    refs.some((ref) => /\.js(?:\?|$)/.test(ref)),
    "the Studio page references an entry script",
  );
  for (const ref of refs) {
    const response = await fetch(new URL(ref, `${base}/`));
    const body = await response.text();
    const type = response.headers.get("content-type") ?? "";
    const expected = /\.js(?:\?|$)/.test(ref) ? /javascript/ : /css/;
    check(
      response.ok && expected.test(type) && body.length > 0,
      `the Studio asset ${ref} is served (${type})`,
    );
  }
}

const work = await mkdtemp(join(tmpdir(), "plico-tarballs-"));
try {
  const tarballs = join(work, "tarballs");
  await mkdir(tarballs);
  const packed = new Map();
  for (const { directory, manifest } of publishedPackages()) {
    run("pnpm", ["pack", "--pack-destination", tarballs], { cwd: directory });
    const file = `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
    packed.set(manifest.name, join(tarballs, file).replaceAll("\\", "/"));
  }
  check(packed.size >= 6, `packed ${packed.size} packages`);

  // Dependencies between Plico packages are pinned to the workspace version, which is not on the
  // registry. Overrides point every one of them at its tarball, as a published install would.
  // Only the packages a user installs by name are direct dependencies, so a missing dependency
  // between Plico packages fails here instead of being papered over. `create-plico` gets its own
  // project, as it does under `npx`, so the CLI's dependencies cannot hoist in to cover for it.
  const specs = Object.fromEntries([...packed].map(([name, file]) => [name, `file:${file}`]));
  async function install(directory, names) {
    check(
      names.every((name) => specs[name]),
      `${names.join(", ")} were packed`,
    );
    await mkdir(directory);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "smoke",
        private: true,
        dependencies: Object.fromEntries(names.map((name) => [name, specs[name]])),
        overrides: specs,
      }),
    );
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: directory });
    return directory;
  }
  const project = await install(join(work, "project"), ["@plico-ai/cli", "plico"]);
  const creator = await install(join(work, "creator"), ["create-plico"]);

  const bin = (name, ...args) => run("npx", ["--no-install", name, ...args], { cwd: project });
  const version = bin("plico", "--version").trim();
  check(/^\d+\.\d+\.\d+/.test(version), `plico --version prints a version (${version})`);

  run("npx", ["--no-install", "create-plico", "demo"], { cwd: creator });
  await cp(join(creator, "demo"), join(project, "demo"), { recursive: true });
  const validation = bin("plico", "validate", "demo");
  check(/valid/i.test(validation), "a scaffolded project validates");

  const dry = bin("plico", "run", "--dry", "demo");
  check(dry.length > 0, "a dry run of the scaffold completes");

  const server = spawn(
    windows ? "npx.cmd" : "npx",
    ["--no-install", "plico", "serve", "--studio", "--port", "0", "demo"],
    { cwd: project, shell: windows, stdio: ["ignore", "pipe", "inherit"] },
  );
  server.stdout.setEncoding("utf8");
  try {
    const base = await waitForServing(server);
    const health = await fetch(`${base}/health`);
    check(health.ok, "the installed server answers /health");
    const page = await fetch(`${base}/`);
    const html = await page.text();
    check(page.ok && html.includes("<div id="), "the installed server serves the bundled Studio");
    await checkStudioAssets(base, html);
  } finally {
    try {
      // `npx` starts the server through a shell, so stop the whole tree. It may already be gone.
      if (windows && server.pid)
        execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
      else server.kill();
    } catch {}
  }
  console.log("Tarball smoke test passed.");
} finally {
  await rm(work, { recursive: true, force: true });
}
