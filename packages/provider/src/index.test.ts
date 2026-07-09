import { describe, expect, it, vi } from "vitest";
import { createOpenAIProvider } from "./index.js";

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  });
}

describe("createOpenAIProvider", () => {
  it("converts a ModelRequest into an OpenAI chat completion request and returns a ModelResponse", async () => {
    const fetch = mockFetch({
      id: "chatcmpl-123",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello from OpenAI!" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
    });
    vi.stubGlobal("fetch", fetch);

    const provider = createOpenAIProvider({ apiKey: "sk-test", model: "gpt-4o" });
    const response = await provider.complete({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello." },
      ],
      maxSteps: 10,
    });

    expect(response.content).toBe("Hello from OpenAI!");
    expect(response.usage).toEqual({ inputTokens: 15, outputTokens: 5 });

    const callArgs = fetch.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(callArgs?.body ?? "{}");
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello." },
    ]);
    expect(body.max_tokens).toBe(4096);

    vi.unstubAllGlobals();
  });

  it("includes tools in the OpenAI request when ModelRequest.tools is provided", async () => {
    const fetch = mockFetch({
      id: "chatcmpl-456",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "create_ticket", arguments: '{"title":"VPN down"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });
    vi.stubGlobal("fetch", fetch);

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const response = await provider.complete({
      messages: [{ role: "user", content: "Create ticket" }],
      maxSteps: 10,
      tools: [
        {
          name: "create_ticket",
          description: "Create a ticket",
          inputSchema: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
            additionalProperties: false,
          },
        },
      ],
    });

    expect(response.content).toBe("");
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0]).toMatchObject({
      name: "create_ticket",
      arguments: { title: "VPN down" },
    });

    const callArgs = fetch.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(callArgs?.body ?? "{}");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      type: "function",
      function: { name: "create_ticket", description: "Create a ticket" },
    });

    vi.unstubAllGlobals();
  });

  it("converts provider HTTP errors into native diagnostics with actionable messages", async () => {
    const fetch = mockFetch(
      {
        error: { message: "Incorrect API key provided.", type: "invalid_request_error" },
      },
      401,
    );
    vi.stubGlobal("fetch", fetch);

    const provider = createOpenAIProvider({ apiKey: "sk-wrong" });

    await expect(
      provider.complete({
        messages: [{ role: "user", content: "Hi" }],
        maxSteps: 10,
      }),
    ).rejects.toThrow("OpenAI API error (401): Incorrect API key provided.");

    vi.unstubAllGlobals();
  });

  it("returns usage metadata when the provider supplies it", async () => {
    const fetch = mockFetch({
      id: "chatcmpl-789",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Short reply" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    });
    vi.stubGlobal("fetch", fetch);

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const response = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
      maxSteps: 10,
    });

    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(3);

    vi.unstubAllGlobals();
  });

  it("throws a clear error when no API key is configured", async () => {
    vi.stubEnv("PLICO_OPENAI_API_KEY", "");

    const provider = createOpenAIProvider();
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn().mockRejectedValue(new Error("Unauthorized"));
    vi.stubGlobal("fetch", fetch);

    await expect(
      provider.complete({
        messages: [{ role: "user", content: "Hi" }],
        maxSteps: 10,
      }),
    ).rejects.toThrow(/API key/);

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", originalFetch);
  });

  it("supports OpenAI-compatible base URL for gateways", async () => {
    let capturedUrl = "";
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            id: "cmpl-1",
            choices: [
              { index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
      };
    });
    vi.stubGlobal("fetch", fetch);

    const provider = createOpenAIProvider({
      apiKey: "sk-test",
      baseUrl: "https://my-gateway.example.com/v1",
    });
    await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
      maxSteps: 10,
    });

    expect(capturedUrl).toBe("https://my-gateway.example.com/v1/chat/completions");

    vi.unstubAllGlobals();
  });
});
