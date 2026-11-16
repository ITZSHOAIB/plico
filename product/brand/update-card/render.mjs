// Usage: node render.mjs <card.json>  ->  out/<card>.png (2160x2700, 4:5)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const card = resolve(process.argv[2]);
const name = basename(card, ".json");
const html = readFileSync(join(here, "template.html"), "utf8").replace(
  "/*DATA*/{}",
  readFileSync(card, "utf8"),
);
mkdirSync(join(here, "out"), { recursive: true });
const page = join(here, "out", `${name}.html`);
writeFileSync(page, html);
const edge = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
execFileSync(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--user-data-dir=${join(here, ".edge-profile")}`,
    "--force-device-scale-factor=2",
    "--window-size=1080,1350",
    "--virtual-time-budget=8000",
    `--screenshot=${join(here, "out", `${name}.png`)}`,
    pathToFileURL(page).href,
  ],
  { stdio: "ignore" },
);
// Edge can return before the screenshot is on disk; wait up to 10 seconds for it.
const png = join(here, "out", `${name}.png`);
for (let i = 0; i < 100 && !existsSync(png); i++) await new Promise((r) => setTimeout(r, 100));
if (!existsSync(png)) throw new Error(`no screenshot written: ${png}`);
console.log(png);
