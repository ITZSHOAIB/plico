// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type {
  ArtifactWorkspace,
  ComposedInstructions,
  EvalReport,
  LoadedProject,
  PlicoEvent,
  ReadinessReport,
  RunSummary,
} from "./types";

const project = { root: "/demo", config: { name: "Internal Ops" } } as unknown as LoadedProject;

const run: RunSummary = {
  runId: "run-1234567890ab",
  projectRoot: "/demo",
  projectName: "Internal Ops",
  status: "blocked",
  startedAt: "2026-10-31T10:00:00.000Z",
  endedAt: "2026-10-31T10:00:01.000Z",
};

function event(sequence: number, type: PlicoEvent["type"], payload = {}): PlicoEvent {
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
  };
}

const events = [
  event(1, "run.started"),
  event(2, "tool.call", { toolName: "create-ticket", arguments: { title: "Fix VPN" } }),
  event(3, "tool.result", { toolName: "create-ticket", result: { id: 7 } }),
  event(4, "approval.required", { toolName: "delete-ticket" }),
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
    { path: "summary.md", content: "# Weekly summary", mimeType: "text/markdown", version: 2 },
    { path: "data.json", content: '{"ok":true}', mimeType: "application/json", version: 1 },
    { path: "notes.txt", content: "plain note", mimeType: "text/plain", version: 1 },
  ],
  snapshots: [{ snapshotId: "snapshot-1", fileCount: 3, createdAt: run.startedAt }],
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface StubState {
  report: EvalReport | null;
}

function stubApi(state: StubState = { report: evalReport }) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const path = String(input);
    if (path === "/v1/project") return json({ project });
    if (path === "/v1/runs") return json([run]);
    if (path === "/v1/instructions") return json(instructions);
    if (path === "/v1/readiness") return json(readiness);
    if (path === `/v1/runs/${run.runId}`) return json(run);
    if (path === `/v1/runs/${run.runId}/events`) return json(events);
    if (path === `/v1/runs/${run.runId}/workspace`) return json(workspace);
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

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

async function openRun() {
  fireEvent.click(await screen.findByRole("button", { name: /run-12345678/ }));
  await screen.findByText("tool.call");
}

function posts(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

describe("overview", () => {
  it("is useful as the first screen", async () => {
    stubApi();
    render(<App />);

    const overview = await screen.findByRole("region", { name: "Project overview" });

    expect(within(overview).getByText("Internal Ops")).toBeTruthy();
    expect(await within(overview).findByText("1 ok, 1 warning(s), 0 error(s)")).toBeTruthy();
    expect(await within(overview).findByText("1/2 passed, 1 failed")).toBeTruthy();
    expect(await within(overview).findByText(/1 run\(s\)/)).toBeTruthy();
    expect(await within(overview).findByText("agent.md, skills/triage.md")).toBeTruthy();
  });

  it("shows when evals have not run yet", async () => {
    stubApi({ report: null });
    render(<App />);

    expect(await screen.findByText("No eval results yet")).toBeTruthy();
  });

  it("shows an error when the project cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { message: "bad" } }, 400)),
    );
    render(<App />);

    expect(await screen.findByText("Failed to load project")).toBeTruthy();
  });
});

describe("run inspection", () => {
  it("renders the timeline from persisted events with tools and approvals visible", async () => {
    stubApi();
    render(<App />);

    await openRun();

    expect(screen.getByText("run.started")).toBeTruthy();
    expect(screen.getByText("tool.result")).toBeTruthy();
    expect(screen.getAllByText("create-ticket")).toHaveLength(2);
    expect(screen.getByText("delete-ticket requires approval")).toBeTruthy();
  });

  it("replays raw events", async () => {
    stubApi();
    render(<App />);
    await openRun();

    click("Raw events");

    const raw = screen.getByLabelText("Raw events").textContent ?? "";
    expect(JSON.parse(raw)).toEqual(events);
  });
});

describe("instructions", () => {
  it("shows the composed content and its sources", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });

    click("Instructions");

    expect(await screen.findByText("# Agent instructions")).toBeTruthy();
    expect(screen.getByText("Sources: agent.md, skills/triage.md")).toBeTruthy();
  });
});

describe("artifacts", () => {
  async function openArtifacts() {
    stubApi();
    render(<App />);
    await openRun();
    click("Artifacts");
    await screen.findByText(/Artifact Workspace/);
  }

  it("lists files with versions and snapshots", async () => {
    await openArtifacts();

    expect(screen.getByRole("button", { name: /summary\.md.*v2/ })).toBeTruthy();
    expect(screen.getByText(/snapshot-1/)).toBeTruthy();
  });

  it("previews Markdown, JSON, and text", async () => {
    await openArtifacts();

    click(/summary\.md/);
    expect(screen.getByRole("heading", { name: "Weekly summary" })).toBeTruthy();
    click(/Back to files/);

    click(/data\.json/);
    expect(screen.getByText(/"ok": true/)).toBeTruthy();
    click(/Back to files/);

    click(/notes\.txt/);
    expect(screen.getByText("plain note")).toBeTruthy();
  });
});

describe("evals", () => {
  it("shows the latest results without running evals", async () => {
    const fetchMock = stubApi();
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });

    click("Evals");

    expect(await screen.findByText(/1\/2 passed, 1 failed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /smoke/ })).toBeTruthy();
    expect(posts(fetchMock)).toEqual([]);
  });

  it("runs evals on request and refreshes the results", async () => {
    const fetchMock = stubApi({ report: null });
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });
    click("Evals");
    await screen.findByText("No eval results yet. Run evals to see them here.");

    click("Run evals");

    expect(await screen.findByRole("button", { name: /smoke/ })).toBeTruthy();
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("opens a result and returns to the list", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });
    click("Evals");

    fireEvent.click(await screen.findByRole("button", { name: /tone/ }));
    expect(screen.getByText("Expected output to contain friendly")).toBeTruthy();

    click(/Back to evals/);
    expect(screen.getByRole("button", { name: /smoke/ })).toBeTruthy();
  });

  it("opens the run behind a result", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("button", { name: /run-12345678/ });
    click("Evals");
    fireEvent.click(await screen.findByRole("button", { name: /smoke/ }));

    click("View run");

    expect(await screen.findByText("tool.call")).toBeTruthy();
  });
});

describe("eval runs from outside Studio", () => {
  it("opens a run that appeared after Studio loaded its run list", async () => {
    const fetchMock = stubApi();
    const stubbed = fetchMock.getMockImplementation() as typeof fetchMock;
    fetchMock.mockImplementation(async (input, init) =>
      input === "/v1/runs" ? json([]) : stubbed(input, init),
    );
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });
    click("Evals");
    fireEvent.click(await screen.findByRole("button", { name: /smoke/ }));

    click("View run");

    expect(await screen.findByText("tool.call")).toBeTruthy();
  });

  it("says when the run behind a result cannot be opened", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });
    click("Evals");
    fireEvent.click(await screen.findByRole("button", { name: /tone/ }));

    click("View run");

    expect(await screen.findByText("Failed to open run eval-tone")).toBeTruthy();
  });

  it("keeps the latest results when running evals fails", async () => {
    const fetchMock = stubApi();
    const stubbed = fetchMock.getMockImplementation() as typeof fetchMock;
    fetchMock.mockImplementation(async (input, init) =>
      init?.method === "POST" ? json({ error: { message: "boom" } }, 500) : stubbed(input, init),
    );
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });
    click("Evals");
    await screen.findByRole("button", { name: /smoke/ });

    click("Run evals");

    expect(await screen.findByText("Failed to run evals")).toBeTruthy();
    expect(screen.getByRole("button", { name: /smoke/ })).toBeTruthy();
  });
});

describe("readiness", () => {
  it("renders the report from server data", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("region", { name: "Project overview" });

    click("Readiness");

    expect(await screen.findByText("Local Readiness Report")).toBeTruthy();
    expect(screen.getByText("Add more evals")).toBeTruthy();
  });
});
