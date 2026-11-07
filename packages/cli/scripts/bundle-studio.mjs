// Copies the built Studio into dist/studio so `npm install @plico/cli` carries its own UI.
// @plico/studio is private; it stays a dev dependency only to make the workspace build it first.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(packageRoot, "..", "studio", "dist");
const target = join(packageRoot, "dist", "studio");

if (!existsSync(join(source, "index.html"))) {
  console.error(`Studio is not built: ${source}. Run: pnpm --filter @plico/studio build`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
