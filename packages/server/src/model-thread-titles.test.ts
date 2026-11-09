import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteEventStore,
  createSqliteThreadStore,
  type ModelProvider,
} from "@plico/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestServer } from "./testing/test-server.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function start(options: { threads?: string; files?: Record<string, string> }) {
  const root = await mkdtemp(join(tmpdir(), "plico-model-titles-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  const threads = options.threads ? `, threads: ${options.threads}` : "";
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" }${threads} };`,
  );
  await writeFile(join(root, "agent.md"), "instructions");
  for (const [file, text] of Object.entries(options.files ?? {})) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), text);
  }
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  cleanups.push(() => threadStore.close());
  const requests: string[] = [];
  const provider: ModelProvider = {
    async *stream(request) {
      const last = request.messages.at(-1)?.content ?? "";
      requests.push(last);
      yield {
        type: "text",
        text: last.startsWith("Write a title") ? '"VPN outage in Berlin"' : "Understood.",
      };
      yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const { plico } = createTestServer({ projectRoot: root, eventStore, threadStore, provider });
  const thread = await plico.threads.create();
  async function say(content: string): Promise<void> {
    const { runId } = await plico.threads.send(thread.id, content);
    if (!runId) throw new Error("No run started.");
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(runId))?.status).toBe("completed"),
    );
  }
  const title = async () => (await plico.threads.get(thread.id))?.title;
  return { say, title, requests };
}

describe("model-written thread titles", () => {
  it("keeps keyword titles by default and never asks the model", async () => {
    const { say, title, requests } = await start({});

    await say("Please reset the VPN token for the Berlin office");

    expect(await title()).toMatch(/VPN/);
    expect(requests.some((request) => request.startsWith("Write a title"))).toBe(false);
  });

  it("asks the model for a title when threads.title is model", async () => {
    const { say, title } = await start({ threads: '{ title: "model" }' });

    await say("Please reset the VPN token for the Berlin office");

    await vi.waitFor(async () => expect(await title()).toBe("VPN outage in Berlin"));
  });

  it("uses the project's threads/title.ts function", async () => {
    const { say, title } = await start({
      files: {
        "threads/title.ts": `export default async (messages: Array<{ role: string; content: string }>) =>
          "Custom: " + messages[0]?.content.split(" ").slice(0, 2).join(" ");`,
      },
    });

    await say("Reset the VPN token for the Berlin office");

    await vi.waitFor(async () => expect(await title()).toBe("Custom: Reset the"));
  });

  it("keeps the keyword title when the custom function throws", async () => {
    const { say, title } = await start({
      files: { "threads/title.ts": 'export default () => { throw new Error("nope"); };' },
    });

    await say("Please reset the VPN token for the Berlin office");

    expect(await title()).toMatch(/VPN/);
  });
});
