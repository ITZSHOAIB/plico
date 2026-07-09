import type { OpenAIProviderConfig } from "./types.js";

interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

interface ModelToolCall {
  name: string;
  arguments: unknown;
}

interface ModelRequest {
  messages: ProviderMessage[];
  maxSteps: number;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }>;
}

interface ModelResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: ModelToolCall[];
}

interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function resolveApiKey(config: OpenAIProviderConfig): string {
  if (config.apiKey) return config.apiKey;
  const envKey = process.env.PLICO_OPENAI_API_KEY;
  if (envKey) return envKey;
  throw new Error(
    "OpenAI API key is required. Set it in the provider config (apiKey) or via the PLICO_OPENAI_API_KEY environment variable.",
  );
}

function resolveBaseUrl(config: OpenAIProviderConfig): string {
  const base = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

function resolveModel(config: OpenAIProviderConfig): string {
  return config.model ?? "gpt-4o";
}

function buildOpenAIRequest(request: ModelRequest, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: request.messages.map((msg) => {
      const m: Record<string, string> = { role: msg.role, content: msg.content };
      if (msg.toolCallId) m.tool_call_id = msg.toolCallId;
      if (msg.toolName) m.name = msg.toolName;
      return m;
    }),
    max_tokens: 4096,
  };

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  return body;
}

function parseOpenAIResponse(data: Record<string, unknown>): ModelResponse {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (!choices || choices.length === 0) {
    throw new Error("OpenAI API returned no choices in the response.");
  }

  const choice = choices[0];
  const message = choice.message as Record<string, unknown> | undefined;

  const content = typeof message?.content === "string" ? message.content : "";

  const usageRaw = data.usage as Record<string, unknown> | undefined;
  let usage: ModelResponse["usage"];
  if (usageRaw) {
    usage = {
      inputTokens: (usageRaw.prompt_tokens as number) ?? 0,
      outputTokens: (usageRaw.completion_tokens as number) ?? 0,
    };
  } else {
    usage = { inputTokens: 0, outputTokens: 0 };
  }

  const toolCallsRaw = message?.tool_calls as Array<Record<string, unknown>> | undefined;
  let toolCalls: ModelToolCall[] | undefined;
  if (toolCallsRaw && toolCallsRaw.length > 0) {
    toolCalls = toolCallsRaw.map((tc) => {
      const func = tc.function as Record<string, unknown> | undefined;
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse((func?.arguments as string) ?? "{}");
      } catch {
        parsedArgs = {};
      }
      return {
        name: (func?.name as string) ?? "",
        arguments: parsedArgs,
      };
    });
  }

  return { content, usage, toolCalls };
}

function handleOpenAIError(status: number, body: Record<string, unknown>): never {
  const errorBody = body.error as Record<string, unknown> | undefined;
  const message = (errorBody?.message as string) ?? (body.error as string) ?? "Unknown error";
  throw new Error(`OpenAI API error (${status}): ${message}`);
}

export function createOpenAIProvider(
  config: OpenAIProviderConfig = { type: "openai" },
): ModelProvider {
  const baseUrl = resolveBaseUrl(config);
  const model = resolveModel(config);

  return {
    async complete(request: ModelRequest): Promise<ModelResponse> {
      const apiKey = resolveApiKey(config);
      const body = buildOpenAIRequest(request, model);

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        handleOpenAIError(response.status, data);
      }

      return parseOpenAIResponse(data);
    },
  };
}
