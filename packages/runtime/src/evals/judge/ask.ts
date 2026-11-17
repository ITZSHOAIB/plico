import { setTimeout as delay } from "node:timers/promises";
import type { JsonValue } from "@plico-ai/contracts";
import { ModelProviderError } from "../../errors.js";
import type {
  EvalJudgeRecord,
  ModelChunk,
  ModelProvider,
  ModelRequest,
} from "../../types/index.js";
import type { JudgePrompt } from "./prompts.js";

export const JUDGE_TEMPERATURE = 0;
const JUDGE_TIMEOUT_MS = 120_000;

/** How often a call the provider turned away for now is tried again, as for the agent's calls. */
export interface JudgeRetries {
  retries?: number;
  retryDelayMs?: number;
}

export interface JudgeAnswer {
  choice: string;
  score: number;
  reasons: string;
  record: EvalJudgeRecord;
}

/** One model call with the prompt alone: no tools, one step. */
async function call(
  provider: ModelProvider,
  request: ModelRequest,
): Promise<{ raw: string; finish?: Extract<ModelChunk, { type: "finish" }> }> {
  let raw = "";
  let finish: Extract<ModelChunk, { type: "finish" }> | undefined;
  for await (const chunk of provider.stream(request, {
    signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
  })) {
    if (chunk.type === "text") raw += chunk.text;
    else if (chunk.type === "finish") finish = chunk;
  }
  return finish ? { raw, finish } : { raw };
}

/** `call`, tried again with backoff while the provider reports a retryable error. */
async function callWithRetries(
  provider: ModelProvider,
  request: ModelRequest,
  { retries = 2, retryDelayMs = 100 }: JudgeRetries,
): ReturnType<typeof call> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(provider, request);
    } catch (error) {
      if (!(error instanceof ModelProviderError && error.retryable) || attempt >= retries)
        throw error;
      await delay(retryDelayMs * 2 ** attempt);
    }
  }
}

/** Some reasoning models accept only their default temperature and reject the request. */
const refusesTemperature = (error: unknown) =>
  error instanceof ModelProviderError &&
  error.kind === "bad_request" &&
  /temperature/i.test(error.message);

/**
 * Asks the judge one question in a single model call at temperature 0, or at the provider's
 * default when the model refuses 0.
 */
export async function askJudge(
  provider: ModelProvider,
  model: string,
  { prompt, scores }: JudgePrompt,
  retries: JudgeRetries = {},
): Promise<JudgeAnswer> {
  const choices = Object.keys(scores);
  const outputSchema = {
    type: "object",
    properties: { reasons: { type: "string" }, choice: { type: "string", enum: choices } },
    required: ["reasons", "choice"],
    additionalProperties: false,
  };
  const request: ModelRequest = {
    messages: [{ role: "user", content: prompt }],
    maxSteps: 1,
    ...(provider.supportsStructuredOutput ? { outputSchema } : {}),
  };
  let temperature: number | undefined = JUDGE_TEMPERATURE;
  let answered: Awaited<ReturnType<typeof call>>;
  try {
    answered = await callWithRetries(provider, { ...request, temperature }, retries);
  } catch (error) {
    if (!refusesTemperature(error)) throw error;
    temperature = undefined;
    answered = await callWithRetries(provider, request, retries);
  }
  const { raw, finish } = answered;
  const record: EvalJudgeRecord = {
    model,
    ...(finish?.modelId ? { servedModel: finish.modelId } : {}),
    ...(temperature === undefined ? {} : { temperature }),
    prompt,
    raw,
    ...(finish ? { usage: finish.usage } : {}),
  };

  const answer = parseAnswer(raw);
  // Only the listed choices count; an inherited key such as "toString" is not one.
  const score = answer && Object.hasOwn(scores, answer.choice) ? scores[answer.choice] : undefined;
  if (!answer || score === undefined) {
    const said = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(
      `the answer was not JSON with "reasons" and a "choice" from ${choices.join(", ")}. It said: ${JSON.stringify(said)}`,
    );
  }
  return { choice: answer.choice, score, reasons: answer.reasons, record };
}

/** The judge's JSON, also when a provider without schema output wraps it in a code fence. */
function parseAnswer(raw: string): { reasons: string; choice: string } | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  let value: JsonValue;
  try {
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const { reasons, choice } = value;
  if (typeof choice !== "string") return undefined;
  return { reasons: typeof reasons === "string" ? reasons : "", choice: choice.trim() };
}
