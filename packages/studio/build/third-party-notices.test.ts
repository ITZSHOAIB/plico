import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { thirdPartyNotices } from "./third-party-notices";

function fakePackage(root: string, name: string, license: string, licenseText?: string) {
  const dir = join(root, "node_modules", ...name.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.2.3", license }));
  if (licenseText) writeFileSync(join(dir, "LICENSE"), licenseText);
  return dir;
}

describe("thirdPartyNotices", () => {
  it("lists each bundled package once with its licence text", () => {
    const root = mkdtempSync(join(tmpdir(), "plico-notices-"));
    const markdown = fakePackage(root, "react-markdown", "MIT", "MIT License\nCopyright Espen");
    const font = fakePackage(
      root,
      "@fontsource-variable/inter",
      "OFL-1.1",
      "SIL Open Font License",
    );

    const text = thirdPartyNotices(
      [
        join(markdown, "lib", "index.js"),
        join(markdown, "lib", "other.js"),
        join(font, "index.css"),
        join(root, "src", "App.tsx"),
        "\0vite/preload-helper",
      ],
      "Copied source: shadcn",
    );

    expect(text).toMatch(/^Copied source: shadcn/);
    expect(text).toContain("react-markdown@1.2.3 (MIT)");
    expect(text).toContain("Copyright Espen");
    expect(text).toContain("@fontsource-variable/inter@1.2.3 (OFL-1.1)");
    expect(text).toContain("SIL Open Font License");
    expect(text.match(/react-markdown@/g)).toHaveLength(1);
    expect(text).not.toContain("App.tsx");
  });

  it("names a package without a licence file by its declared licence", () => {
    const root = mkdtempSync(join(tmpdir(), "plico-notices-"));
    const dir = fakePackage(root, "tiny-util", "ISC");

    const text = thirdPartyNotices([join(dir, "index.js")], "");

    expect(text).toContain("tiny-util@1.2.3 (ISC)");
    expect(text).toContain("No licence file shipped");
  });
});
