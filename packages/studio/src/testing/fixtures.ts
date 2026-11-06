import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import type {
  ArtifactSnapshotDetail,
  ArtifactWorkspace,
  ComposedInstructions,
  EvalReport,
  LoadedProject,
  PlicoEvent,
  ReadinessReport,
  RunSummary,
} from "../types";

const project = { root: "/demo", config: { name: "Internal Ops" } } as unknown as LoadedProject;

const run: RunSummary = {
  runId: "run-1234567890ab",
  projectRoot: "/demo",
  projectName: "Internal Ops",
  status: "waiting",
  startedAt: "2026-10-31T10:00:00.000Z",
  endedAt: null,
};

export const otherRun: RunSummary = {
  runId: "run-other-1234",
  projectRoot: "/demo",
  projectName: "Internal Ops",
  status: "running",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: null,
};

export function runEvent<T extends PlicoEvent["type"]>(
  sequence: number,
  type: T,
  payload: PlicoEvent<T>["payload"],
): PlicoEvent {
  return {
    schemaVersion: 1,
    streamType: "run",
    streamId: run.runId,
    runId: run.runId,
    id: `event-${sequence}`,
    sequence,
    timestamp: run.startedAt,
    type,
    payload,
  } as PlicoEvent;
}

export const events = [
  runEvent(1, "run.started", { projectRoot: "/demo", projectName: "Internal Ops" }),
  runEvent(2, "tool.call", { toolName: "create-ticket", arguments: { title: "Fix VPN" } }),
  runEvent(3, "tool.result", { toolName: "create-ticket", result: { id: 7 } }),
  runEvent(4, "approval.requested", {
    requestId: "approval-1",
    toolName: "delete-ticket",
    arguments: {},
    approval: { required: true },
  }),
];

const instructions: ComposedInstructions = {
  content: "# Agent instructions",
  sources: ["agent.md", "skills/triage.md"],
};

const workspace: ArtifactWorkspace = {
  workspaceId: "workspace-1",
  runId: run.runId,
  createdAt: run.startedAt,
  files: [
    {
      path: "summary.md",
      content: "# Weekly summary",
      mimeType: "text/markdown",
      version: 2,
      contentHash: "summary-hash",
    },
    {
      path: "data.json",
      content: '{"ok":true}',
      mimeType: "application/json",
      version: 1,
      contentHash: "data-hash",
    },
    {
      path: "notes.txt",
      content: "plain note",
      mimeType: "text/plain",
      version: 1,
      contentHash: "notes-hash",
    },
  ],
  versions: [
    {
      path: "summary.md",
      mimeType: "text/markdown",
      version: 1,
      contentHash: "summary-hash-old",
      createdAt: run.startedAt,
    },
    {
      path: "summary.md",
      mimeType: "text/markdown",
      version: 2,
      contentHash: "summary-hash",
      createdAt: run.startedAt,
    },
    {
      path: "data.json",
      mimeType: "application/json",
      version: 1,
      contentHash: "data-hash",
      createdAt: run.startedAt,
    },
    {
      path: "notes.txt",
      mimeType: "text/plain",
      version: 1,
      contentHash: "notes-hash",
      createdAt: run.startedAt,
    },
  ],
  snapshots: [{ snapshotId: "snapshot-1", fileCount: 3, createdAt: run.startedAt }],
};

const snapshot: ArtifactSnapshotDetail = {
  snapshotId: "snapshot-1",
  fileCount: workspace.files.length,
  createdAt: run.startedAt,
  files: workspace.files,
};

const evalReport: EvalReport = {
  schemaVersion: 1,
  total: 2,
  passed: 1,
  failed: 1,
  evaluatedAt: "2026-10-31T09:00:00.000Z",
  fixturesDigest: "digest",
  results: [
    { name: "smoke", status: "pass", runId: run.runId, runStatus: "completed", output: "Hello" },
    {
      name: "tone",
      status: "fail",
      runId: "eval-tone",
      runStatus: "completed",
      diagnostics: ["Expected output to contain friendly"],
    },
  ],
};

const readiness: ReadinessReport = {
  projectRoot: "/demo",
  timestamp: run.startedAt,
  summary: { ok: 1, warning: 1, error: 0 },
  diagnostics: [
    { severity: "ok", subsystem: "project.structure", message: "Project is valid" },
    { severity: "warning", subsystem: "evals.fixtures", message: "Add more evals" },
  ],
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface StubState {
  report: EvalReport | null;
}

export function stubApi(
  state: StubState = { report: evalReport },
  options: {
    waitingApproval?: boolean;
    includeOtherRun?: boolean;
    cancelResult?: "accepted" | "ignored" | "unknown";
    diffError?: { status: number; code: string; message: string };
  } = {},
) {
  window.history.replaceState(null, "", "/");
  const runEvents = options.waitingApproval
    ? [
        ...events,
        runEvent(5, "run.waiting", { requestId: "approval-1", toolName: "delete-ticket" }),
      ]
    : events;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const path = String(input);
    if (path === "/v1/project") return json({ project });
    if (path === "/v1/runs") return json(options.includeOtherRun ? [run, otherRun] : [run]);
    if (path === "/v1/instructions") return json(instructions);
    if (path === "/v1/readiness") return json(readiness);
    if (path === `/v1/runs/${run.runId}`) return json(run);
    if (path === `/v1/runs/${run.runId}/events`) return json(runEvents);
    if (path === `/v1/runs/${otherRun.runId}/events`) return json([]);
    if (path === `/v1/runs/${run.runId}/signal` && method === "POST")
      return json({ result: "accepted" });
    if (path === `/v1/runs/${run.runId}/cancel` && method === "POST")
      return json({ result: options.cancelResult ?? "accepted" });
    if (path === `/v1/runs/${run.runId}/workspace`) return json(workspace);
    if (path === `/v1/runs/${run.runId}/workspace/snapshots/snapshot-1`) return json(snapshot);
    if (
      path === `/v1/runs/${run.runId}/workspace/diffs?path=summary.md&fromVersion=1&toVersion=2`
    ) {
      if (options.diffError)
        return json(
          { error: { code: options.diffError.code, message: options.diffError.message } },
          options.diffError.status,
        );
      return json({
        path: "summary.md",
        fromVersion: 1,
        toVersion: 2,
        diff: "--- summary.md\n+++ summary.md\n-# Previous summary\n+# Weekly summary\n",
      });
    }
    if (path === "/v1/eval" && method === "POST") {
      state.report = evalReport;
      return json(evalReport);
    }
    if (path === "/v1/eval") {
      return state.report
        ? json(state.report)
        : json({ error: { code: "eval.not_found", message: "No eval results yet." } }, 404);
    }
    return json({ error: { code: "route.not_found", message: path } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

export async function openRun() {
  fireEvent.click(await screen.findByRole("button", { name: /run-12345678/ }));
  await screen.findByText("tool.call");
}
