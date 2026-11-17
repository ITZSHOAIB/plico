import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReadiness, createSqliteEventStore, runEvals } from "../index.js";
import { outputProject } from "../testing/structured-output.js";

async function project(files: Record<string, string>, root?: string): Promise<string> {
  const target = root ?? (await mkdtemp(join(tmpdir(), "plico-md-evals-")));
  for (const dir of ["skills", "tools", "evals/scorers", "artifacts", "memory"])
    await mkdir(join(target, dir), { recursive: true });
  if (!root) {
    await writeFile(
      join(target, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Demo" } as const;\n',
    );
    await writeFile(join(target, "agent.md"), "# Demo\n");
    await writeFile(
      join(target, "tools", "lookup.tool.ts"),
      'export default { name: "lookup", description: "Look up", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => ({ found: true }) };',
    );
  }
  for (const [file, text] of Object.entries(files))
    await writeFile(join(target, "evals", file), text);
  return target;
}

const script = JSON.stringify([
  { type: "tool.call", toolName: "lookup", arguments: { q: "vpn" }, result: { found: true } },
  { type: "artifact.write", files: [{ path: "report.md", content: "VPN outage" }] },
  { type: "assistant.output", content: "Found the VPN outage" },
]);

describe("Markdown eval cases", () => {
  it("passes the expect checks against the whole run", async () => {
    const root = await project({
      "vpn.md": `---
expect:
  status: completed
  contains: VPN
  tool: lookup
  notTool: [send_email]
  artifact: report.md
---
`,
      "vpn.script.json": script,
    });

    const summary = await runEvals(root);

    expect(summary).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(summary.results[0]).toMatchObject({ name: "vpn", status: "pass" });
  });

  it("fails with one diagnostic per unmet check", async () => {
    const root = await project({
      "vpn.md": `---
expect:
  contains: printer
  tool: send_email
  notTool: lookup
  artifact: [report.md, summary.md]
---
`,
      "vpn.script.json": script,
    });

    const [result] = (await runEvals(root)).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual([
      expect.stringContaining('"printer"'),
      expect.stringContaining('"send_email" was not called'),
      expect.stringContaining('"lookup" was called'),
      expect.stringContaining('"summary.md" was not written'),
    ]);
  });

  it("checks structuredOutput fields under expect.output", async () => {
    const root = await project(
      {
        "ticket.md": "---\nexpect:\n  output:\n    ticket: T-1\n---\n",
        "ticket.script.json": JSON.stringify([
          { type: "assistant.output", content: '{"ticket":"T-2"}' },
        ]),
      },
      await outputProject(),
    );

    const [result] = (await runEvals(root)).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual([expect.stringContaining("output.ticket")]);
  });

  it("reports criteria and budgets as skipped in scripted mode without failing", async () => {
    const root = await project({
      "vpn.md": "---\nexpect:\n  maxTokens: 10\n---\n- Names the outage\n- Stays polite\n",
      "vpn.script.json": script,
    });

    const [result] = (await runEvals(root)).results;

    expect(result?.status).toBe("pass");
    expect(result?.diagnostics).toEqual([
      expect.stringMatching(/^Skipped.*maxTokens.*--live/),
      expect.stringMatching(/^Skipped.*2 judge criteria.*--live/),
    ]);
  });

  it("skips rubric and factuality scorers in scripted mode without failing", async () => {
    const root = await project({
      "vpn.md":
        "---\nscorers:\n  - rubric: { 0: Wrong, 1: Right }\n  - factuality: VPN outage\n---\n",
      "vpn.script.json": script,
    });

    const [result] = (await runEvals(root)).results;

    expect(result?.status).toBe("pass");
    expect(result?.diagnostics).toEqual([
      "Skipped in scripted mode: 2 judged scorers run with --live.",
    ]);
  });

  it("skips a case without a fixture and does not run the fixture of a case on its own", async () => {
    const root = await project({
      "live-only.md": "---\nexpect:\n  status: completed\n---\n",
      "vpn.md": "---\nexpect:\n  status: completed\n---\n",
      "vpn.script.json": script,
    });

    const summary = await runEvals(root);

    expect(summary).toMatchObject({ total: 1, passed: 1 });
    expect(summary.skipped).toEqual([
      { name: "live-only", reason: expect.stringContaining("--live") },
    ]);
  });

  it("names the file and line of an invalid case", async () => {
    const root = await project({ "bad.md": "---\nexpect:\n  stauts: completed\n---\n" });

    await expect(runEvals(root)).rejects.toThrow("evals/bad.md:3");
  });

  it("runs custom scorers from evals/scorers/ with their threshold", async () => {
    const root = await project({
      "vpn.md": "---\nscorers: [short, { use: polite, threshold: 0.5 }]\n---\n",
      "vpn.script.json": script,
      "scorers/short.ts": `export default {
  name: "short",
  score: ({ output }: { output: string }) => ({ score: output.length < 10 ? 1 : 0.4, reason: "too long" }),
};`,
      "scorers/polite.ts": `export default { name: "polite", score: async () => ({ score: 0.5 }) };`,
    });

    const [result] = (await runEvals(root)).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual(['Scorer "short" scored 0.4, below 1: too long']);
  });

  it("fails a case whose scorer returns a score that is not a number from 0 to 1", async () => {
    const root = await project({
      "vpn.md": "---\nscorers: [broken]\n---\n",
      "vpn.script.json": script,
      "scorers/broken.ts": `export default { name: "broken", score: () => ({ score: Number.NaN }) };`,
    });

    const [result] = (await runEvals(root)).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual([
      'Scorer "broken" threw: it must return { score } from 0 to 1',
    ]);
  });

  it("treats stored results as stale once a Markdown case or scorer changes", {
    timeout: 30_000,
  }, async () => {
    const root = await project({
      "vpn.md": "---\nscorers: [polite]\n---\n",
      "vpn.script.json": script,
      "scorers/polite.ts": `export default { name: "polite", score: () => ({ score: 1 }) };`,
    });
    const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
    const stale = async () =>
      (await checkReadiness(root, { eventStore })).diagnostics.find(
        (d) => d.subsystem === "evals.results",
      )?.severity;

    await runEvals(root, { eventStore });
    expect(await stale()).toBe("ok");

    await project(
      { "scorers/polite.ts": `export default { name: "polite", score: () => ({ score: 0 }) };` },
      root,
    );
    expect(await stale()).toBe("warning");

    await runEvals(root, { eventStore });
    await project({ "vpn.md": "---\nexpect:\n  status: completed\n---\n" }, root);
    expect(await stale()).toBe("warning");
  });
  it("runs a fixture on its own beside a Markdown file that is not a case", async () => {
    const root = await project({
      "vpn.md": "Notes about the VPN case.\n",
      "vpn.script.json": script,
    });

    expect(await runEvals(root)).toMatchObject({ total: 1, passed: 1 });
  });

  it("fails only the case whose scorer throws", async () => {
    const root = await project({
      "a.md": "---\nscorers: [boom]\n---\n",
      "a.script.json": script,
      "b.md": "---\nexpect:\n  contains: VPN\n---\n",
      "b.script.json": script,
      "scorers/boom.ts": `export default { name: "boom", score: () => { throw new Error("kaboom"); } };`,
    });

    const summary = await runEvals(root);

    expect(summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(summary.results[0]?.diagnostics).toEqual([
      expect.stringContaining('Scorer "boom" threw: kaboom'),
    ]);
  });
});
