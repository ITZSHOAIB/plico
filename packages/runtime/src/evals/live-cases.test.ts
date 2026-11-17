import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ModelChunk, ModelProvider, ModelRequest } from "../index.js";
import { runEvals } from "../index.js";

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-live-evals-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(
    join(root, "tools", "create-ticket.tool.ts"),
    `export default {
  name: "create_ticket",
  description: "Create a ticket",
  inputSchema: { type: "object" },
  capabilities: [],
  approval: { required: false },
  handler: () => { throw new Error("The real handler ran"); },
};`,
  );
  for (const [file, text] of Object.entries(files))
    await writeFile(join(root, "evals", file), text);
  return root;
}

type Turn = (request: ModelRequest) => ModelChunk[];

const finish = (tokens = 10): ModelChunk => ({
  type: "finish",
  usage: { inputTokens: tokens / 2, outputTokens: tokens / 2 },
});

/** Calls the ticket tool once, then answers with the text it was given and the tool's result. */
const ticketAgent: Turn = (request) => {
  const tool = request.messages.find((m) => m.role === "tool");
  if (!tool)
    return [
      { type: "tool.call", call: { id: "c1", name: "create_ticket", arguments: {} } },
      finish(),
    ];
  const user = request.messages.find((m) => m.role === "user")?.content ?? "";
  return [{ type: "text", text: `${user} -> ${tool.content}` }, finish()];
};

function fakeProvider(turn: Turn, onRequest?: () => void): ModelProvider {
  return {
    async *stream(request) {
      onRequest?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
      yield* turn(request);
    },
  };
}

describe("live eval cases", { timeout: 30_000 }, () => {
  it("sends the case input to the model and returns mocked tool results", async () => {
    const root = await project({
      "vpn.md": `---
input: VPN is down
mocks:
  create_ticket: { id: T-1 }
expect:
  tool: create_ticket
  contains: T-1
---
`,
      "vpn.script.json": JSON.stringify([{ type: "assistant.output", content: "fixture" }]),
    });

    const summary = await runEvals(root, { live: { provider: fakeProvider(ticketAgent) } });

    expect(summary).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(summary.results[0]?.output).toBe('VPN is down -> {"id":"T-1"}');
  });

  it("takes tool results from the fixture with mockTools and never runs a handler", async () => {
    const root = await project({
      "vpn.md": "---\ninput: VPN is down\nexpect:\n  contains: T-9\n---\n",
      "vpn.script.json": JSON.stringify([
        { type: "tool.call", toolName: "create_ticket", arguments: {}, result: { id: "T-9" } },
        { type: "assistant.output", content: "fixture" },
      ]),
      "printer.md": "---\ninput: Printer jam\nexpect:\n  contains: T-\n---\n",
    });

    const summary = await runEvals(root, {
      live: { provider: fakeProvider(ticketAgent), mockTools: true },
    });
    const byName = Object.fromEntries(summary.results.map((r) => [r.name, r]));

    expect(byName.vpn?.status).toBe("pass");
    expect(byName.printer?.output).toContain("No fixture result for tool create_ticket");
    expect(JSON.stringify(summary)).not.toContain("The real handler ran");
  });

  it("holds a mocked tool that needs approval, leaving the run waiting", async () => {
    const root = await project({
      "refund.md": `---
input: Refund order A-1
mocks:
  issue_refund: { refunded: true }
expect:
  status: waiting
  tool: issue_refund
---
`,
    });
    await writeFile(
      join(root, "tools", "refund.tool.ts"),
      'export default { name: "issue_refund", description: "Refund", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => ({ refunded: true }) };',
    );
    const refundAgent = fakeProvider(() => [
      { type: "tool.call", call: { id: "r1", name: "issue_refund", arguments: {} } },
      finish(),
    ]);

    const summary = await runEvals(root, { live: { provider: refundAgent } });

    expect(summary.results[0]).toMatchObject({ status: "pass", runStatus: "waiting" });
  });

  it("skips cases without input and fixtures on their own", async () => {
    const root = await project({
      "no-input.md": "---\nexpect:\n  status: completed\n---\n",
      "legacy.script.json": JSON.stringify([{ type: "assistant.output", content: "x" }]),
    });

    const summary = await runEvals(root, { live: { provider: fakeProvider(ticketAgent) } });

    expect(summary.total).toBe(0);
    expect(summary.skipped).toEqual([
      { name: "legacy", reason: expect.stringContaining("no input") },
      { name: "no-input", reason: expect.stringContaining("no input") },
    ]);
  });

  it("passes a case with trials only when every trial passes", async () => {
    const root = await project({
      "flaky.md": "---\ninput: hi\ntrials: 3\nexpect:\n  contains: good\n---\n",
    });
    let call = 0;
    const flaky = fakeProvider(() => [
      { type: "text", text: call++ === 1 ? "bad" : "good" },
      finish(),
    ]);

    const [result] = (await runEvals(root, { live: { provider: flaky, concurrency: 1 } })).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics?.[0]).toBe("2/3 trials passed.");
    expect(result?.diagnostics).toContainEqual(expect.stringMatching(/^Trial 2\/3: .*"good"/));
  });

  it("checks the token and latency budgets against the live run", async () => {
    const root = await project({
      "costly.md": "---\ninput: hi\nexpect:\n  maxTokens: 5\n  maxLatencyMs: 60000\n---\n",
    });
    const provider = fakeProvider(() => [{ type: "text", text: "ok" }, finish(10)]);

    const [result] = (await runEvals(root, { live: { provider } })).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual([expect.stringContaining("10 tokens, over 5")]);
  });

  it("starts no case or trial once the token cap is reached", async () => {
    const root = await project({
      "a.md": "---\ninput: hi\n---\n",
      "b.md": "---\ninput: hi\ntrials: 2\n---\n",
      "c.md": "---\ninput: hi\n---\n",
    });
    const provider = fakeProvider(() => [{ type: "text", text: "ok" }, finish(10)]);

    const summary = await runEvals(root, {
      live: { provider, maxTokens: 15, concurrency: 1 },
    });

    expect(summary).toMatchObject({ total: 1, passed: 1, tokenCapReached: true });
    expect(summary.skipped).toEqual([
      { name: "b", reason: "Token cap of 15 reached after 1 of 2 trials." },
      { name: "c", reason: "Token cap of 15 reached." },
    ]);
  });

  it("runs at most the given number of live runs at once", async () => {
    const files = Object.fromEntries(
      ["a", "b", "c", "d", "e"].map((name) => [`${name}.md`, "---\ninput: hi\n---\n"]),
    );
    const root = await project(files);
    let inFlight = 0;
    let peak = 0;
    const provider: ModelProvider = {
      async *stream() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
        yield { type: "text", text: "ok" };
        yield finish();
      },
    };

    const summary = await runEvals(root, { live: { provider, concurrency: 2 } });

    expect(summary.passed).toBe(5);
    expect(peak).toBe(2);
  });
});
