import type {
  ArtifactSnapshotDetail,
  ArtifactWorkspace,
  ComposedInstructions,
  EvalReport,
  EvalSummary,
  LoadedProject,
  PlicoEvent,
  ReadinessReport,
  RunSummary,
  Thread,
  ThreadMessage,
} from "./types";

async function parseJson<T>(url: string, response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }

  return (await response.json()) as T;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return parseJson(url, await fetch(url, init));
}

async function getJsonOrNull<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  return response.status === 404 ? null : parseJson(url, response);
}

export async function fetchProject(): Promise<LoadedProject> {
  const body = await getJson<{ project: LoadedProject }>("/v1/project");
  return body.project;
}

export function fetchRuns(): Promise<RunSummary[]> {
  return getJson("/v1/runs");
}

export function fetchThreads(): Promise<Thread[]> {
  return getJson("/v1/threads");
}

export function createThread(): Promise<Thread> {
  return getJson("/v1/threads", { method: "POST" });
}

export function fetchThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  return getJson(`/v1/threads/${encodeURIComponent(threadId)}/messages`);
}

export async function sendThreadMessage(threadId: string, content: string): Promise<ThreadMessage> {
  const url = `/v1/threads/${encodeURIComponent(threadId)}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Could not send message (${response.status}).`);
  }
  return response.json() as Promise<ThreadMessage>;
}

export function fetchRun(runId: string): Promise<RunSummary> {
  return getJson(`/v1/runs/${encodeURIComponent(runId)}`);
}

export function fetchEvents(runId: string): Promise<PlicoEvent[]> {
  return getJson(`/v1/runs/${encodeURIComponent(runId)}/events`);
}

export async function sendApprovalDecision(
  runId: string,
  requestId: string,
  approved: boolean,
): Promise<"accepted" | "ignored" | "unknown"> {
  const url = `/v1/runs/${encodeURIComponent(runId)}/signal`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `approval:${requestId}`, value: { approved } }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ?? `Could not send approval decision (${response.status}).`,
    );
  }
  const body = (await response.json()) as { result?: string };
  if (body.result !== "accepted" && body.result !== "ignored" && body.result !== "unknown") {
    throw new Error("The server returned an invalid approval result.");
  }
  return body.result;
}

export function fetchInstructions(): Promise<ComposedInstructions> {
  return getJson("/v1/instructions");
}

export function fetchArtifactWorkspace(runId: string): Promise<ArtifactWorkspace | null> {
  return getJsonOrNull(`/v1/runs/${encodeURIComponent(runId)}/workspace`);
}

export function fetchArtifactSnapshot(
  runId: string,
  snapshotId: string,
): Promise<ArtifactSnapshotDetail> {
  return getJson(
    `/v1/runs/${encodeURIComponent(runId)}/workspace/snapshots/${encodeURIComponent(snapshotId)}`,
  );
}

export function fetchLatestEvalReport(): Promise<EvalReport | null> {
  return getJsonOrNull("/v1/eval");
}

export function runEvals(): Promise<EvalSummary> {
  return getJson("/v1/eval", { method: "POST" });
}

export function fetchReadiness(): Promise<ReadinessReport> {
  return getJson("/v1/readiness");
}
