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

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await (init === undefined ? fetch(url) : fetch(url, init));
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }

  return (await response.json()) as T;
}

async function getJsonOrNull<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function fetchProject(): Promise<LoadedProject> {
  const body = await getJson<{ project: LoadedProject }>("/v1/project");
  return body.project;
}

export function fetchRuns(): Promise<RunSummary[]> {
  return getJson("/v1/runs");
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
