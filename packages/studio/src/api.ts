import type {
  ArtifactWorkspace,
  ComposedInstructions,
  EvalReport,
  EvalSummary,
  LoadedProject,
  PlicoEvent,
  ReadinessReport,
  RunSummary,
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

export function fetchRun(runId: string): Promise<RunSummary> {
  return getJson(`/v1/runs/${encodeURIComponent(runId)}`);
}

export function fetchEvents(runId: string): Promise<PlicoEvent[]> {
  return getJson(`/v1/runs/${encodeURIComponent(runId)}/events`);
}

export function fetchInstructions(): Promise<ComposedInstructions> {
  return getJson("/v1/instructions");
}

export function fetchArtifactWorkspace(runId: string): Promise<ArtifactWorkspace | null> {
  return getJsonOrNull(`/v1/runs/${encodeURIComponent(runId)}/workspace`);
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
