// Puts the built docs (`@plico/docs`, a Next.js static export) under the Astro site's `dist`, so
// one Cloudflare Pages deploy serves the homepage at `/` and the docs at `/docs`.
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const docsOut = fileURLToPath(new URL("../../docs/out", import.meta.url));
const dist = fileURLToPath(new URL("../dist", import.meta.url));

// The homepage owns its own 404 page, and the docs app's not-found shell is not a route.
const skipped = new Set(["404.html", "_not-found", "_not-found.html", "_not-found.txt"]);

async function exists(path) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

if (!(await exists(docsOut))) {
  throw new Error(`Build the docs first (pnpm --filter @plico/docs build): ${docsOut} is missing.`);
}

await mkdir(dist, { recursive: true });
for (const name of await readdir(docsOut)) {
  if (skipped.has(name)) continue;
  const target = join(dist, name);
  if (await exists(target)) {
    throw new Error(`The docs build and the homepage both write ${name}; rename one of them.`);
  }
  await cp(join(docsOut, name), target, { recursive: true });
}
console.log("Merged the docs into the website build.");
