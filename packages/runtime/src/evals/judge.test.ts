import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ModelChunk, ModelProvider, ModelRequest } from "../index.js";
import { ModelProviderError, runEvals } from "../index.js";

async function project(files: Record<string, string>, config = ""): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-judge-evals-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Demo", model: { provider: "openai", name: "agent-model" }${config} } as const;\n`,
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    'export default { name: "lookup", description: "Look up", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => ({ outage: "VPN" }) };',
  );
  for (const [file, text] of Object.entries(files))
    await writeFile(join(root, "evals", file), text);
  return root;
}

const finish = (tokens = 10): ModelChunk => ({
  type: "finish",
  usage: { inputTokens: tokens / 2, outputTokens: tokens / 2 },
});

/** Looks the outage up, then reports it. */
const agent: ModelProvider = {
  async *stream(request) {
    if (!request.messages.some((m) => m.role === "tool")) {
      yield { type: "tool.call", call: { id: "c1", name: "lookup", arguments: { q: "vpn" } } };
      yield finish();
      return;
    }
    yield { type: "text", text: "The VPN is down." };
    yield finish();
  },
};

/** A judge that answers each prompt with `answer(prompt)` and records what it was asked. */
function judge(answer: (prompt: string) => string, asked: Array<{ ref: string } & ModelRequest>) {
  return (ref: string): ModelProvider => ({
    supportsStructuredOutput: true,
    async *stream(request) {
      asked.push({ ref, ...request });
      yield { type: "text", text: answer(request.messages[0]?.content ?? "") };
      yield { ...finish(4), modelId: `${ref}-served` };
    },
  });
}

const choose = (choice: string, reasons = "Because.") => JSON.stringify({ reasons, choice });

describe("judged eval checks", { timeout: 30_000 }, () => {
  it("asks the judge about each criterion and fails the ones it rejects", async () => {
    const root = await project({
      "vpn.md": "---\ninput: Is the VPN up?\n---\n- Names the outage\n- Offers a workaround\n",
    });
    const asked: Array<{ ref: string } & ModelRequest> = [];
    const answer = (prompt: string) =>
      prompt.includes("Offers a workaround") ? choose("N", "No workaround is given.") : choose("Y");

    const summary = await runEvals(root, {
      live: { provider: agent, judgeProvider: judge(answer, asked) },
    });
    const [result] = summary.results;

    expect(asked).toHaveLength(2);
    expect(asked[0]).toMatchObject({ ref: "openai:agent-model", temperature: 0, maxSteps: 1 });
    expect(asked[0]?.messages[0]?.content).toContain("Is the VPN up?");
    expect(asked[0]?.messages[0]?.content).toContain('lookup({"q":"vpn"})');
    expect(asked[0]?.messages[0]?.content).toContain('{"outage":"VPN"}');
    expect(asked[0]?.messages[0]?.content).toContain("The VPN is down.");
    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual([
      'Criterion "Offers a workaround" not met: No workaround is given.',
    ]);
    expect(result?.scores).toEqual([
      expect.objectContaining({ kind: "criterion", name: "Names the outage", score: 1 }),
      expect.objectContaining({
        kind: "criterion",
        score: 0,
        passed: false,
        judge: expect.objectContaining({
          model: "openai:agent-model",
          servedModel: "openai:agent-model-served",
          temperature: 0,
          raw: choose("N", "No workaround is given."),
        }),
      }),
    ]);
  });

  it("scores a rubric by level and factuality by grade against their thresholds", async () => {
    const root = await project({
      "graded.md": `---
input: Is the VPN up?
scorers:
  - rubric: { 0: Wrong, 1: Names the outage, 2: Names the outage and when it ends }
  - factuality: The VPN is down until 5pm.
    threshold: 0.4
---
`,
    });
    const answer = (prompt: string) => (prompt.includes("[Expert]") ? choose("A") : choose("1"));

    const [result] = (
      await runEvals(root, { live: { provider: agent, judgeProvider: judge(answer, []) } })
    ).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toEqual(["Rubric scored 0.5 (level 1 of 2), below 0.7: Because."]);
    expect(result?.scores).toEqual([
      expect.objectContaining({ kind: "rubric", score: 0.5, threshold: 0.7, passed: false }),
      expect.objectContaining({ kind: "factuality", score: 0.4, threshold: 0.4, passed: true }),
    ]);
  });

  it("takes the judge from the scorer, then the case, then evals.judge, then the model", async () => {
    const root = await project(
      {
        "a.md": "---\ninput: hi\n---\n- Polite\n",
        "b.md":
          "---\ninput: hi\njudge: openai:case-judge\nscorers:\n  - factuality: hi\n    judge: openai:scorer-judge\n---\n- Polite\n",
      },
      ', evals: { judge: "openai:config-judge" }',
    );
    const asked: Array<{ ref: string } & ModelRequest> = [];
    const answer = (prompt: string) => (prompt.includes("[Expert]") ? choose("C") : choose("Y"));

    await runEvals(root, {
      live: { provider: agent, judgeProvider: judge(answer, asked), concurrency: 1 },
    });

    expect(asked.map((a) => a.ref).sort()).toEqual([
      "openai:case-judge",
      "openai:config-judge",
      "openai:scorer-judge",
    ]);
  });

  it.each([
    ["is not JSON", "Looks fine to me"],
    ["names an inherited key", JSON.stringify({ reasons: "x", choice: "toString" })],
  ])("fails a check whose judge answer %s", async (_, answer) => {
    const root = await project({ "vpn.md": "---\ninput: hi\n---\n- Polite\n" });

    const [result] = (
      await runEvals(root, {
        live: { provider: agent, judgeProvider: judge(() => answer, []) },
      })
    ).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics?.[0]).toMatch(
      /^Judge openai:agent-model could not grade criterion "Polite": /,
    );
  });

  it("skips a case whose judge call would pass the token cap", async () => {
    const root = await project({ "vpn.md": "---\ninput: hi\n---\n- Polite\n" });
    const oneCall: ModelProvider = {
      async *stream() {
        yield { type: "text", text: "Hello" };
        yield finish(10);
      },
    };

    const summary = await runEvals(root, {
      live: { provider: oneCall, judgeProvider: judge(() => choose("Y"), []), maxTokens: 12 },
    });

    expect(summary).toMatchObject({ total: 0, tokenCapReached: true });
    expect(summary.skipped).toEqual([{ name: "vpn", reason: "Token cap of 12 reached." }]);
  });

  it("asks again at the provider's default temperature when it refuses temperature 0", async () => {
    const root = await project({ "vpn.md": "---\ninput: hi\n---\n- Polite\n" });
    const temperatures: Array<number | undefined> = [];
    const reasoningJudge: ModelProvider = {
      async *stream(request) {
        temperatures.push(request.temperature);
        if (request.temperature !== undefined)
          throw new ModelProviderError(
            "bad_request",
            "Model provider rejected the request (HTTP 400): Unsupported value: 'temperature' does not support 0.",
          );
        yield { type: "text", text: choose("Y") };
        yield finish(4);
      },
    };

    const [result] = (
      await runEvals(root, { live: { provider: agent, judgeProvider: () => reasoningJudge } })
    ).results;

    expect(result?.status).toBe("pass");
    expect(temperatures).toEqual([0, undefined]);
    expect(result?.scores?.[0]?.judge).not.toHaveProperty("temperature");
  });

  it("retries a judge call the provider turned away for now", async () => {
    const root = await project({ "vpn.md": "---\ninput: hi\n---\n- Polite\n" });
    let calls = 0;
    const busyJudge: ModelProvider = {
      async *stream() {
        if (calls++ === 0)
          throw new ModelProviderError("rate_limit", "Model provider rate limit reached.");
        yield { type: "text", text: choose("Y") };
        yield finish(4);
      },
    };

    const [result] = (
      await runEvals(root, { live: { provider: agent, judgeProvider: () => busyJudge } })
    ).results;

    expect(calls).toBe(2);
    expect(result?.status).toBe("pass");
  });

  it("does not ask the judge about a run that failed", async () => {
    const root = await project({ "vpn.md": "---\ninput: hi\n---\n- Polite\n" });
    const asked: Array<{ ref: string } & ModelRequest> = [];
    const broken: ModelProvider = {
      // biome-ignore lint/correctness/useYield: the run fails before the model answers.
      async *stream() {
        throw new ModelProviderError("bad_request", "Model provider rejected the request.");
      },
    };

    const [result] = (
      await runEvals(root, {
        live: { provider: broken, judgeProvider: judge(() => choose("Y"), asked) },
      })
    ).results;

    expect(asked).toEqual([]);
    expect(result?.status).toBe("fail");
    expect(result?.diagnostics).toContain("Skipped 1 judged check: the run failed.");
  });

  it("fails judged checks when no judge model is configured", async () => {
    const root = await project({ "vpn.md": "---\ninput: hi\n---\n- Polite\n" });
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Demo" } as const;\n',
    );

    const [result] = (await runEvals(root, { live: { provider: agent } })).results;

    expect(result?.status).toBe("fail");
    expect(result?.diagnostics?.[0]).toContain("evals.judge");
  });
});
