import type { RunResult } from "@plico/runtime";
import { readCount, readString } from "./values.js";

export function formatRunResult(target: string, result: RunResult, dry = true): string[] {
  const lines = [`Running ${dry ? "dry runtime" : "model"} for ${target}`];

  for (const event of result.events) {
    if (event.type === "run.started") {
      lines.push(`run.started: ${readString(event.payload.projectName) ?? "unknown project"}`);
      continue;
    }

    if (event.type === "instructions.composed") {
      lines.push(`instructions.composed: ${readCount(event.payload.sources)} source(s)`);
      continue;
    }

    if (event.type === "tools.discovered") {
      lines.push(`tools.discovered: ${readCount(event.payload.tools)} tool(s)`);
      continue;
    }

    if (event.type === "model.request") {
      lines.push(`model.request: ${readCount(event.payload.messages)} message(s)`);
      continue;
    }

    if (event.type === "model.response") {
      const content = readString(event.payload.content);
      lines.push(`model.response: ${content?.slice(0, 80) ?? "no content"}`);
      continue;
    }

    if (event.type === "assistant.output") {
      lines.push(`assistant.output: ${readString(event.payload.content) ?? ""}`);
      continue;
    }

    if (event.type === "tool.call") {
      lines.push(`tool.call: ${readString(event.payload.toolName) ?? "unknown tool"}`);
      continue;
    }

    if (event.type === "tool.result") {
      lines.push(`tool.result: ${readString(event.payload.toolName) ?? "unknown tool"}`);
      continue;
    }

    if (event.type === "approval.requested") {
      lines.push(`approval.requested: ${readString(event.payload.toolName) ?? "unknown tool"}`);
      continue;
    }

    if (event.type === "run.waiting") {
      lines.push("run.waiting: approval required");
      continue;
    }

    if (event.type === "run.completed") {
      lines.push("run.completed: completed");
      continue;
    }

    if (event.type === "run.failed") {
      lines.push("run.failed: failed");
      continue;
    }

    if (event.type === "run.cancelled") {
      lines.push("run.cancelled: cancelled");
      continue;
    }

    if (event.type === "run.error") {
      lines.push(`run.error: ${readString(event.payload.message) ?? "runtime error"}`);
    }
  }

  if (result.status === "waiting") {
    lines.push(dry ? "Dry run waiting for approval." : "Run waiting for approval.");
  } else if (result.status === "failed") {
    lines.push(dry ? "Dry run failed." : "Run failed.");
  }

  return lines;
}
