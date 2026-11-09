import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkReadiness,
  createConfiguredModelProvider,
  modelProviderRecoveryKey,
} from "../index.js";
import type { ModelChunk, ModelProvider, ModelRequest } from "../types/index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

const request: ModelRequest = {
  messages: [{ role: "user", content: "hi" }],
  tools: [],
  maxSteps: 1,
};

async function collect(provider: ModelProvider | undefined): Promise<ModelChunk[]> {
  const parts: ModelChunk[] = [];
  for await (const part of provider?.stream(request, { signal: new AbortController().signal }) ??
    [])
    parts.push(part);
  return parts;
}

async function failure(provider: ModelProvider | undefined): Promise<string> {
  try {
    await collect(provider);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("native providers", () => {
  it.each([
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["google", "GOOGLE_GENERATIVE_AI_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
  ])("%s reads its key from %s", async (provider, variable) => {
    vi.stubEnv(variable, "");
    delete process.env[variable];

    const message = await failure(createConfiguredModelProvider({ provider, name: "m" }));

    expect(message).toContain(variable);
  });

  it("reads the key from apiKeyEnv when the config names one", async () => {
    vi.stubEnv("CUSTOM_KEY", "");
    delete process.env.CUSTOM_KEY;

    const message = await failure(
      createConfiguredModelProvider({
        provider: "openai-compatible",
        name: "m",
        apiKeyEnv: "CUSTOM_KEY",
      }),
    );

    expect(message).toContain("CUSTOM_KEY");
  });

  it("has no adapter for a provider the project has to supply", () => {
    expect(createConfiguredModelProvider({ provider: "acme", name: "m" })).toBeUndefined();
  });
});

describe("recovery key", () => {
  it("changes with the credential, endpoint and model but never contains the secret", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-one");
    const base = modelProviderRecoveryKey({ provider: "anthropic", name: "m" });

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-two");
    const otherKey = modelProviderRecoveryKey({ provider: "anthropic", name: "m" });
    const otherModel = modelProviderRecoveryKey({ provider: "anthropic", name: "n" });
    const otherUrl = modelProviderRecoveryKey({
      provider: "anthropic",
      name: "m",
      baseURL: "http://proxy.local/v1",
    });

    expect(new Set([base, otherKey, otherModel, otherUrl]).size).toBe(4);
    expect(base).not.toContain("sk-one");
  });
});

describe("readiness", () => {
  it("names the variable the configured provider needs", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    delete process.env.ANTHROPIC_API_KEY;
    const root = await mkdtemp(join(tmpdir(), "plico-ready-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir));
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "R", model: { provider: "anthropic", name: "m" } };',
    );
    await writeFile(join(root, "agent.md"), "# R\n\nAnswer from the project.\n");

    const report = await checkReadiness(root);

    const credentials = report.diagnostics.find((d) => d.subsystem === "provider.credentials");
    expect(credentials?.severity).toBe("warning");
    expect(credentials?.message).toContain("ANTHROPIC_API_KEY");
  });
});

describe("project provider module", () => {
  it("streams from a model that providers/<name>.ts returns", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-provider-module-"));
    await mkdir(join(root, "providers"));
    const aiTest = pathToFileURL(createRequire(import.meta.url).resolve("ai/test")).href;
    const ai = pathToFileURL(createRequire(import.meta.url).resolve("ai")).href;
    await writeFile(
      join(root, "providers", "acme.mjs"),
      `import { MockLanguageModelV4 } from "${aiTest}";
import { simulateReadableStream } from "${ai}";
export default ({ model }) =>
  new MockLanguageModelV4({
    modelId: model,
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "from " + model },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 3, noCache: 3 },
              outputTokens: { total: 2, text: 2 },
            },
          },
        ],
      }),
    }),
  });
`,
    );

    const parts = await collect(
      createConfiguredModelProvider({ provider: "acme", name: "m1" }, root),
    );

    expect(parts.filter((p) => p.type === "text")).toEqual([{ type: "text", text: "from m1" }]);
    expect(parts.at(-1)).toMatchObject({
      type: "finish",
      usage: { inputTokens: 3, outputTokens: 2 },
    });
  });
});
