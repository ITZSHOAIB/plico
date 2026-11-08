// @vitest-environment node
/// <reference types="node" />
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { createSqliteEventStore, createSqliteThreadStore } from "../../runtime/src/index";
import { createTestServer } from "../../server/src/testing/test-server";
import { App } from "./App";

const realFetch = globalThis.fetch;
let base = "";

class LocalEventSource extends EventTarget {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private controller = new AbortController();
  constructor(url: string) {
    super();
    void this.read(url);
  }
  close() {
    this.controller.abort();
  }
  private async read(url: string) {
    try {
      const response = await realFetch(`${base}${url}`, { signal: this.controller.signal });
      if (!response.ok || !response.body) throw new Error("Stream unavailable");
      this.onopen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!this.controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block.split("\n").find((line) => line.startsWith("data: "));
          if (block.includes("event: plico.event") && data)
            this.dispatchEvent(new MessageEvent("plico.event", { data: data.slice(6) }));
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      if (!this.controller.signal.aborted) this.onerror?.();
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("streams a real server run into Studio and reopens it after restart", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
    "getComputedStyle",
  ] as const)
    vi.stubGlobal(name, dom.window[name]);
  const { cleanup, fireEvent, render, screen, waitFor, within } = await import(
    "@testing-library/react/pure"
  );
  const root = await mkdtemp(join(tmpdir(), "plico-studio-e2e-"));
  for (const directory of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, directory));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "Handle internal operations requests.");
  const databasePath = join(root, "state.sqlite");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let server: Server | undefined;
  let store: ReturnType<typeof createSqliteThreadStore> | undefined;
  async function start() {
    const eventStore = createSqliteEventStore({ databasePath });
    store = createSqliteThreadStore({ databasePath });
    const api = await createTestServer({
      projectRoot: root,
      eventStore,
      threadStore: store,
      provider: {
        async *stream() {
          yield { type: "text", text: "Hello from " };
          await pending;
          yield { type: "text", text: "the agent." };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 2 } };
        },
      },
    });
    server = createServer(api.requestListener);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  async function stop() {
    if (!server) return;
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())),
    );
    server = undefined;
    store?.close();
    store = undefined;
  }
  try {
    await start();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => realFetch(`${base}${url}`, init));
    vi.stubGlobal("EventSource", LocalEventSource);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
    fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
    const input = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Hello Studio" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await within(await screen.findByRole("log")).findByText("Hello from", {}, { timeout: 6000 }),
    ).toBeTruthy();
    release();
    expect(
      await within(screen.getByRole("log")).findByText(
        "Hello from the agent.",
        {},
        { timeout: 6000 },
      ),
    ).toBeTruthy();
    const threads = (await realFetch(`${base}/v1/threads`).then((response) =>
      response.json(),
    )) as Array<{ id: string }>;
    const threadId = threads[0]?.id;
    if (!threadId) throw new Error("Expected a persisted thread");
    cleanup();
    await stop();
    await start();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
    fireEvent.click(await screen.findByRole("button", { name: `Thread ${threadId.slice(0, 8)}` }));
    expect(await screen.findByText("Hello from the agent.")).toBeTruthy();
    expect(await screen.findByText("run.completed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
    const title = screen.getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(title, { target: { value: "Studio greeting" } });
    fireEvent.keyDown(title, { key: "Enter" });
    expect(await screen.findByRole("button", { name: /Studio greeting/ })).toBeTruthy();
    const renamed = (await realFetch(`${base}/v1/threads/${threadId}`).then((response) =>
      response.json(),
    )) as { title?: string };
    expect(renamed.title).toBe("Studio greeting");
  } finally {
    release();
    cleanup();
    await stop();
    dom.window.close();
  }
}, 20000);
