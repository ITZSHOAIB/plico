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

async function start(options: {
  threads?: string;
  files?: Record<string, string>;
  holdTitles?: boolean;
}) {
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
  const titleGates: Array<() => void> = [];
  const provider: ModelProvider = {
    async *stream(request) {
      const last = request.messages.at(-1)?.content ?? "";
      requests.push(last);
      if (last.startsWith("Write a title") && options.holdTitles) {
        const index = requests.filter((item) => item.startsWith("Write a title")).length;
        await new Promise<void>((release) => {
          titleGates[index - 1] = release;
        });
        yield { type: "text", text: `Title ${index}` };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        return;
      }
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
  const rename = (name: string) => plico.threads.rename(thread.id, name);
  const titleRequests = () => requests.filter((item) => item.startsWith("Write a title")).length;
  return { say, title, requests, rename, titleRequests, titleGates };
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

  it("asks for a title only for the first three replies", async () => {
    const { say, titleRequests } = await start({ threads: '{ title: "model" }' });

    for (const text of ["Reset the VPN", "Add a printer", "Book a room", "Order a laptop"])
      await say(text);

    await vi.waitFor(() => expect(titleRequests()).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(titleRequests()).toBe(3);
  });

  it("never asks for a title after the user renamed the thread", async () => {
    const { say, rename, title, titleRequests } = await start({ threads: '{ title: "model" }' });
    await say("Reset the VPN");
    await vi.waitFor(() => expect(titleRequests()).toBe(1));
    await rename("My name");

    await say("Add a printer");
    await say("Book a room");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(titleRequests()).toBe(1);
    expect(await title()).toBe("My name");
  });

  it("keeps the newer title when older title requests finish last", async () => {
    const { say, title, titleGates } = await start({
      threads: '{ title: "model" }',
      holdTitles: true,
    });
    await say("Reset the VPN");
    await vi.waitFor(() => expect(titleGates[0]).toBeTypeOf("function"));
    await say("Add a printer");
    await vi.waitFor(() => expect(titleGates[1]).toBeTypeOf("function"));

    titleGates[1]?.();
    await vi.waitFor(async () => expect(await title()).toBe("Title 2"));
    titleGates[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await title()).toBe("Title 2");
  });

  it("keeps the keyword title when the custom function throws", async () => {
    const { say, title } = await start({
      files: { "threads/title.ts": 'export default () => { throw new Error("nope"); };' },
    });

    await say("Please reset the VPN token for the Berlin office");

    expect(await title()).toMatch(/VPN/);
  });
});
