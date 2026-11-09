import { pathToFileURL } from "node:url";
import type { ProjectConfig } from "@plico/contracts";
import { findProjectThreadTitleFile } from "@plico/core";
import { register } from "tsx/esm/api";
import type { ModelProvider } from "../types/index.js";
import type { TitleMessage } from "./suggest-title.js";

/** Names a thread from its transcript. May return nothing when there is nothing to say yet. */
export type ThreadTitler = (messages: TitleMessage[]) => Promise<string | undefined>;

const maxTitleLength = 80;
const quotes = /^["'`‘’“”]+|["'`‘’“”.]+$/g;
let registered = false;

/** Takes the first line, drops quotes and trailing punctuation, and keeps it short. */
function cleanTitle(text: string): string | undefined {
  const line = text.trim().split(/\r?\n/)[0] ?? "";
  const title = line.trim().replace(quotes, "").trim();
  return title === "" ? undefined : title.slice(0, maxTitleLength);
}

function modelTitler(provider: ModelProvider): ThreadTitler {
  return async (messages) => {
    const transcript = messages
      .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
      .join("\n")
      .slice(0, 4000);
    let text = "";
    for await (const chunk of provider.stream(
      {
        messages: [
          {
            role: "system",
            content: "You name chat threads. Reply with the title only, no quotes.",
          },
          {
            role: "user",
            content: `Write a title of at most six words for this conversation:\n\n${transcript}`,
          },
        ],
        maxSteps: 1,
      },
      { signal: AbortSignal.timeout(30_000) },
    ))
      if (chunk.type === "text") text += chunk.text;
    return cleanTitle(text);
  };
}

async function moduleTitler(file: string): Promise<ThreadTitler> {
  if (!registered) {
    register();
    registered = true;
  }
  const loaded = (await import(pathToFileURL(file).href)) as { default?: unknown };
  const title = loaded.default;
  if (typeof title !== "function")
    throw new Error("threads/title must export a function by default.");
  return async (messages) => {
    const result: unknown = await title(messages);
    return typeof result === "string" ? cleanTitle(result) : undefined;
  };
}

/**
 * The titler a project asks for: its `threads/title.ts` function, else the model when
 * `threads.title` is `model`. Without either, threads keep their keyword titles.
 */
export async function createThreadTitler(
  root: string,
  config: ProjectConfig,
  provider: ModelProvider | undefined,
): Promise<ThreadTitler | undefined> {
  const file = await findProjectThreadTitleFile(root);
  if (file) return moduleTitler(file);
  if (config.threads?.title === "model" && provider) return modelTitler(provider);
  return undefined;
}
