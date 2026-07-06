import type {
  ArtifactWorkspace,
  ComposedInstructions,
  LoadedProject,
  PlicoEvent,
  RunSummary,
} from "./types";

export async function fetchProject(): Promise<LoadedProject> {
  const response = await fetch("/v1/project");
  const body = (await response.json()) as { project: LoadedProject };
  return body.project;
}

export async function fetchRuns(): Promise<RunSummary[]> {
  const response = await fetch("/v1/runs");
  return (await response.json()) as RunSummary[];
}

export async function fetchRun(runId: string): Promise<RunSummary> {
  const response = await fetch(`/v1/runs/${encodeURIComponent(runId)}`);
  return (await response.json()) as RunSummary;
}

export async function fetchEvents(runId: string, after?: number): Promise<PlicoEvent[]> {
  const params = after === undefined ? "" : `?after=${after}`;
  const response = await fetch(`/v1/runs/${encodeURIComponent(runId)}/events${params}`);
  return (await response.json()) as PlicoEvent[];
}

export async function fetchInstructions(): Promise<ComposedInstructions> {
  const response = await fetch("/v1/instructions");
  return (await response.json()) as ComposedInstructions;
}

export async function fetchArtifactWorkspace(runId: string): Promise<ArtifactWorkspace | null> {
  const response = await fetch(`/v1/runs/${encodeURIComponent(runId)}/workspace`);
  if (!response.ok) return null;
  return (await response.json()) as ArtifactWorkspace;
}
