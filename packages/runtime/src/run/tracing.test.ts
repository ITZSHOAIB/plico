import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { context, createTraceState, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { expect, it } from "vitest";
import { createSqliteEngine, createSqliteEventStore, recoverRuns, runProject } from "../index.js";

it("traces a provider run and its model and tool steps without recording content", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-trace-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "fake", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "private instruction");
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    'export default { name: "lookup", description: "lookup", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => "private tool result" };',
  );
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  trace.setGlobalTracerProvider(provider);
  let calls = 0;
  try {
    const result = await runProject(root, {
      message: "private prompt",
      provider: {
        async *stream() {
          if (calls++ === 0) yield { type: "tool.call", call: { name: "lookup", arguments: {} } };
          else yield { type: "text", text: "private answer" };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 2 } };
        },
      },
    });
    expect(result.status).toBe("completed");
    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(
      expect.arrayContaining(["plico.run", "plico.step", "chat test", "execute_tool lookup"]),
    );
    expect(
      JSON.stringify(
        spans.map(({ attributes, events, status }) => ({ attributes, events, status })),
      ),
    ).not.toMatch(/private (prompt|instruction|answer|tool result)/);
  } finally {
    trace.disable();
    await provider.shutdown();
  }
});

it("links a resumed run to the execution before restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-trace-resume-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  await writeFile(
    join(root, "tools", "approve.tool.ts"),
    'export default { name: "approve", description: "approve", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => "ok" };',
  );
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  try {
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    expect(
      (
        await context.with(
          trace.setSpanContext(ROOT_CONTEXT, {
            traceId: "0123456789abcdef0123456789abcdef",
            spanId: "0123456789abcdef",
            traceFlags: 1,
            traceState: createTraceState("vendor=value"),
          }),
          () =>
            runProject(root, {
              runId: "resume-trace",
              script: [{ type: "tool.call", toolName: "approve", arguments: {} }],
              engine: createSqliteEngine({ databasePath }),
              eventStore: store,
            }),
        )
      ).status,
    ).toBe("waiting");
    const initial = exporter.getFinishedSpans().find((span) => span.name === "plico.run");
    expect(initial).toBeDefined();
    const restarted = createSqliteEngine({ databasePath });
    await restarted.signal("resume-trace", "approval:resume-trace:0", { approved: true });
    await recoverRuns({ engine: restarted, eventStore: store });
    const resumed = exporter
      .getFinishedSpans()
      .filter((span) => span.name === "plico.run")
      .at(-1);
    expect(resumed?.links.map((link) => link.context)).toContainEqual(initial?.spanContext());
    expect(resumed?.links[0]?.context.traceState?.serialize()).toBe("vendor=value");
    expect((await store.getRun("resume-trace"))?.status).toBe("completed");
  } finally {
    context.disable();
    trace.disable();
    await provider.shutdown();
  }
});
