import type { EvalCheck } from "./types.js";

export const toolsCheck: EvalCheck = (expect, run) => {
  const called = new Set(
    run.events.flatMap((event) => (event.type === "tool.call" ? [event.payload.toolName] : [])),
  );
  return [
    ...(expect.tool ?? [])
      .filter((name) => !called.has(name))
      .map((name) => ({ fail: `Tool "${name}" was not called.` })),
    ...(expect.notTool ?? [])
      .filter((name) => called.has(name))
      .map((name) => ({ fail: `Tool "${name}" was called, but expect.notTool rules it out.` })),
  ];
};
