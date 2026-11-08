// Builds THIRD_PARTY_NOTICES.txt from the npm packages that actually end up in the Studio bundle,
// so the published CLI carries every bundled licence without a hand-kept list.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Plugin } from "vite";

const marker = "/node_modules/";

function packageRoot(id: string): string | undefined {
  const path = id.replaceAll("\\", "/");
  const at = path.lastIndexOf(marker);
  if (at === -1) return undefined;
  const parts = path.slice(at + marker.length).split("/");
  const depth = parts[0]?.startsWith("@") ? 2 : 1;
  return path.slice(0, at + marker.length) + parts.slice(0, depth).join("/");
}

function licenceText(dir: string): string | undefined {
  const file = readdirSync(dir).find((name) => /^licen[cs]e(\.(md|txt))?$/i.test(name));
  return file ? readFileSync(join(dir, file), "utf8").trim() : undefined;
}

export function thirdPartyNotices(moduleIds: Iterable<string>, preamble: string): string {
  const roots = new Set<string>();
  for (const id of moduleIds) {
    const root = packageRoot(id);
    if (root && existsSync(join(root, "package.json"))) roots.add(root);
  }
  const entries = [...roots]
    .map((root) => {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      const heading = `${pkg.name}@${pkg.version} (${pkg.license ?? "UNKNOWN"})`;
      return {
        name: String(pkg.name),
        body: `${heading}\n\n${licenceText(root) ?? "No licence file shipped."}`,
      };
    })
    .filter((entry) => !entry.name.startsWith("@plico/"))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rule = `\n\n${"-".repeat(72)}\n\n`;
  const sections = [preamble.trim(), ...entries.map((entry) => entry.body)].filter(Boolean);
  return `${sections.join(rule)}\n`;
}

/**
 * Emits THIRD_PARTY_NOTICES.txt next to the built Studio. `alsoBundled` names packages whose code
 * reaches the bundle without being a module, such as Tailwind's generated preflight CSS.
 */
export function thirdPartyNoticesPlugin(preambleFile: string, alsoBundled: string[] = []): Plugin {
  const require = createRequire(preambleFile);
  return {
    name: "plico-third-party-notices",
    apply: "build",
    generateBundle() {
      const extra = alsoBundled.map((name) => require.resolve(`${name}/package.json`));
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source: thirdPartyNotices(
          [...this.getModuleIds(), ...extra],
          readFileSync(preambleFile, "utf8"),
        ),
      });
    },
  };
}
