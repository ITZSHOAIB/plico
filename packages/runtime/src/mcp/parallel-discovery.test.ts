import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("starts provider discovery for both sources before waiting for either tool list", async () => {
  let entered = 0;
  let release!: () => void;
  let reachedBoth!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const both = new Promise<void>((resolve) => {
    reachedBoth = resolve;
  });
  const beforeList = async () => {
    if (++entered === 2) reachedBoth();
    await blocked;
  };
  const first = await mcpHttp([[ticket]], 0, { beforeList });
  const second = await mcpHttp([[ticket]], 0, { beforeList });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const { root } = await project({
      first: { transport: "streamable-http", url: first.url, tools: ["get_ticket"] },
      second: { transport: "streamable-http", url: second.url, tools: ["get_ticket"] },
    });
    const run = runProject(root, {
      message: "Ready?",
      provider: {
        async *stream() {
          yield { type: "text", text: "Ready" };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });
    const parallel = await Promise.race([
      both.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 3000);
      }),
    ]);
    release();
    expect(await run).toMatchObject({ status: "completed", output: "Ready" });
    expect(parallel).toBe(true);
  } finally {
    release();
    clearTimeout(timeout);
    await first.close();
    await second.close();
  }
});
