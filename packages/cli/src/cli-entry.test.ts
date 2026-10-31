import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void out.push(String(line)));
  vi.spyOn(console, "error").mockImplementation((line: string) => void err.push(String(line)));
  return { out, err };
}

describe("main entry", () => {
  it("prints usage and exits 0 for help, --help and no command", async () => {
    for (const argv of [
      ["node", "plico"],
      ["node", "plico", "help"],
      ["node", "plico", "--help"],
    ]) {
      const { out } = capture();
      expect(await main(argv)).toBe(0);
      expect(out.join("\n")).toContain("Usage: plico validate");
      vi.restoreAllMocks();
    }
  });

  it("exits 1 and writes usage to stderr for an unknown command", async () => {
    const { out, err } = capture();

    const exitCode = await main(["node", "plico", "bogus"]);

    expect(exitCode).toBe(1);
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("Unknown command: bogus");
    expect(err.join("\n")).toContain("Usage: plico validate");
  });

  it("prints the package version for --version", async () => {
    const { out } = capture();

    const exitCode = await main(["node", "plico", "--version"]);

    expect(exitCode).toBe(0);
    expect(out[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("refuses to serve on a non-loopback host without --allow-remote", async () => {
    const { err } = capture();

    const exitCode = await main(["node", "plico", "serve", "--host", "0.0.0.0", "."]);

    expect(exitCode).toBe(1);
    expect(err.join("\n")).toContain("--allow-remote");
  });

  it("does not treat a 127.-prefixed DNS name as loopback", async () => {
    const { err } = capture();

    const exitCode = await main(["node", "plico", "serve", "--host", "127.evil.com", "."]);

    expect(exitCode).toBe(1);
    expect(err.join("\n")).toContain("--allow-remote");
  });
});
