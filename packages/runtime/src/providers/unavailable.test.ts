import { expect, it, vi } from "vitest";
import { createConfiguredModelProvider, type ModelProviderError } from "../index.js";

vi.mock("@ai-sdk/anthropic", () => {
  throw new Error("Cannot find package '@ai-sdk/anthropic'");
});

it("tells the author to install a missing adapter package instead of reporting a network error", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const provider = createConfiguredModelProvider({ provider: "anthropic", name: "m" });
  const stream = provider?.stream(
    { messages: [{ role: "user", content: "hi" }], tools: [], maxSteps: 1 },
    { signal: new AbortController().signal },
  );

  const error = await (async () => {
    try {
      for await (const _ of stream ?? []);
    } catch (caught) {
      return caught as ModelProviderError;
    }
  })();

  expect(error?.message).toContain("pnpm add @ai-sdk/anthropic");
  expect(error?.kind).not.toBe("network");
  expect(error?.retryable).toBe(false);
  vi.unstubAllEnvs();
});
