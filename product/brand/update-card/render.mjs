// Usage: node render.mjs <card.json> [output-directory] -> <name>.png (2160x2700).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw new Error("Usage: node render.mjs <card.json> [output-directory]");
const card = resolve(process.argv[2]);
const output = resolve(process.argv[3] ?? join(dirname(card), "out"));
const fromKit = relative(here, output);
const outsideKit = isAbsolute(fromKit) || fromKit === ".." || fromKit.startsWith(`..${sep}`);
if (!outsideKit) {
  throw new Error(
    "Keep generated files outside the reusable kit. Choose an output directory under artifacts/marketing/.",
  );
}
const data = JSON.parse(readFileSync(card, "utf8"));
if (data.visual?.type === "svg") {
  data.visual.content = readFileSync(resolve(dirname(card), data.visual.file), "utf8");
}
const name = basename(card, ".json");
const html = readFileSync(join(here, "template.html"), "utf8").replace("/*DATA*/{}", () =>
  JSON.stringify(data).replaceAll("<", "\\u003c"),
);
mkdirSync(output, { recursive: true });
const page = join(output, `${name}.html`);
writeFileSync(page, html);
const edge = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
execFileSync(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--user-data-dir=${join(output, ".edge-profile")}`,
    "--force-device-scale-factor=2",
    "--window-size=1080,1350",
    "--virtual-time-budget=8000",
    `--screenshot=${join(output, `${name}.png`)}`,
    pathToFileURL(page).href,
  ],
  { stdio: "ignore" },
);
const png = join(output, `${name}.png`);
for (let i = 0; i < 100 && !existsSync(png); i++) await new Promise((r) => setTimeout(r, 100));
if (!existsSync(png)) throw new Error(`no screenshot written: ${png}`);
console.log(png);
