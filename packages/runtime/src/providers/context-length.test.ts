import { describe, expect, it } from "vitest";
import { createOpenAICompatibleProvider, type ModelProviderError } from "../index.js";

function providerReplying(
  status: number,
  body: unknown,
): ReturnType<typeof createOpenAICompatibleProvider> {
  process.env.CONTEXT_TEST_KEY = "k";
  return createOpenAICompatibleProvider({
    model: "m",
    apiKeyEnv: "CONTEXT_TEST_KEY",
    baseURL: "http://provider.test/v1",
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  });
}

async function failure(status: number, body: unknown): Promise<ModelProviderError> {
  const provider = providerReplying(status, body);
  try {
    for await (const _ of provider.stream(
      { messages: [{ role: "user", content: "hi" }], tools: [], maxSteps: 1 },
      { signal: new AbortController().signal },
    ));
  } catch (error) {
    return error as ModelProviderError;
  }
  throw new Error("expected the request to fail");
}

describe("context length errors", () => {
  it.each([
    [
      "OpenAI",
      {
        error: {
          code: "context_length_exceeded",
          message: "This model's maximum context length is 128000 tokens.",
        },
      },
    ],
    [
      "Anthropic",
      {
        error: {
          type: "invalid_request_error",
          message: "prompt is too long: 210000 tokens > 200000 maximum",
        },
      },
    ],
    [
      "Google",
      {
        error: {
          message:
            "The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).",
        },
      },
    ],
  ])("%s becomes its own non-retryable kind with an actionable message", async (_name, body) => {
    const error = await failure(400, body);

    expect(error.kind).toBe("context_length");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("new thread");
  });

  it("leaves other bad requests as they were", async () => {
    const error = await failure(400, { error: { message: "Invalid value for temperature." } });

    expect(error.kind).toBe("bad_request");
  });
});
