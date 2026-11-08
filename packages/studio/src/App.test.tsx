// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { click, events, json, openRun, stubApi } from "./testing/fixtures";

function posts(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
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
    expect(screen.getByText(/Status: waiting/)).toBeTruthy();
    expect(screen.getByText("Not ended")).toBeTruthy();
  });

  it("approves the waiting tool call through the run signal API", async () => {
    const fetchMock = stubApi(undefined, { waitingApproval: true });
    render(<App />);
    await openRun();

    click("Approve tool call");

    const approval = await screen.findByRole("region", { name: "Approval required" });
    expect(within(approval).getByRole("status").textContent).toContain(
      "Approval approved. The run is resuming.",
    );
    const request = posts(fetchMock).find(([url]) => url === "/v1/runs/run-1234567890ab/signal");
    expect(request?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "approval:approval-1", value: { approved: true } }),
    });
  });

  it("denies the waiting tool call through the run signal API", async () => {
    const fetchMock = stubApi(undefined, { waitingApproval: true });
    render(<App />);
    await openRun();

    click("Deny tool call");

    const approval = await screen.findByRole("region", { name: "Approval required" });
    expect(within(approval).getByRole("status").textContent).toContain(
      "Tool call denied. The run is ending.",
    );
    const request = posts(fetchMock).find(([url]) => url === "/v1/runs/run-1234567890ab/signal");
    expect(request?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "approval:approval-1", value: { approved: false } }),
    });
  });

  it("requests cancellation for an active run", async () => {
    const fetchMock = stubApi();
    render(<App />);
    await openRun();

    click("Cancel run");

    expect(
      await screen.findByText("Cancellation requested. Waiting for the run to stop."),
    ).toBeTruthy();
    const request = posts(fetchMock).find(([url]) => url === "/v1/runs/run-1234567890ab/cancel");
    expect(request?.[1]).toMatchObject({ method: "POST" });
  });

  it("shows the cancel action when switching from a cancelled run to another active run", async () => {
    stubApi(undefined, { includeOtherRun: true });
    render(<App />);
    await openRun();

    click("Cancel run");
    await screen.findByText("Cancellation requested. Waiting for the run to stop.");
    fireEvent.click(await screen.findByRole("button", { name: /run-other-12/ }));

    expect(await screen.findByRole("button", { name: "Cancel run" })).toBeTruthy();
  });

  it("keeps the cancel action available after a cancellation request fails", async () => {
    stubApi(undefined, { cancelResult: "unknown" });
    render(<App />);
    await openRun();

    click("Cancel run");

    expect(await screen.findByText("The execution engine does not know this run.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel run" })).toBeTruthy();
  });

  it("replays raw events", async () => {
    stubApi();
    render(<App />);
    await openRun();

    fireEvent.click(screen.getByRole("tab", { name: "Raw events" }));

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
    expect(
      screen.getByText(/Showing the current workspace, not the workspace at the selected event/i),
    ).toBeTruthy();
  });

  it("shows the thread workspace and the run that wrote each version", async () => {
    await openArtifacts();

    expect(screen.getByText("Thread: thread-123")).toBeTruthy();
    const summary = screen.getByRole("button", { name: /summary/ });
    expect(summary).toBeTruthy();
    expect(summary.querySelector("[title]")?.getAttribute("title")).toContain("run-1234567890ab");
    click(/summary\.md/);

    expect(screen.getByRole("combobox", { name: "From version" }).textContent).toContain(
      "run-writer-1",
    );
    expect(screen.getByRole("combobox", { name: "To version" }).textContent).toContain(
      "run-12345678…",
    );
    expect(
      screen
        .getByRole("combobox", { name: "To version" })
        .querySelector('option[value="2"]')
        ?.getAttribute("title"),
    ).toContain("run-1234567890ab");
  });

  it("previews Markdown, JSON, and text", async () => {
    await openArtifacts();

    click(/summary\.md/);
    expect(screen.getByRole("heading", { name: "Weekly summary" })).toBeTruthy();
    expect(
      screen.getByText(/Showing the current workspace, not the workspace at the selected event/i),
    ).toBeTruthy();
    click(/Back to files/);

    click(/data\.json/);
    expect(screen.getByText(/"ok": true/)).toBeTruthy();
    click(/Back to files/);

    click(/notes\.txt/);
    expect(screen.getByText("plain note")).toBeTruthy();
  });

  it("compares artifact versions and exposes the exported file download", async () => {
    const fetchMock = stubApi();
    render(<App />);
    await openRun();
    click("Artifacts");
    await screen.findByText(/Artifact Workspace/);
    click(/summary\.md/);

    const download = screen.getByRole("link", { name: "Download summary.md" });
    expect(download.getAttribute("href")).toBe(
      "/v1/runs/run-1234567890ab/workspace/exports?path=summary.md",
    );

    click("Compare versions");

    expect(await screen.findByRole("region", { name: "Version diff" })).toBeTruthy();
    expect(screen.getByText(/-# Previous summary/)).toBeTruthy();
    expect(screen.getByText(/\+# Weekly summary/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/runs/run-1234567890ab/workspace/diffs?path=summary.md&fromVersion=1&toVersion=2",
      undefined,
    );
  });

  it("does not offer current version comparisons from a snapshot preview", async () => {
    await openArtifacts();
    click(/snapshot-1/);
    await screen.findByRole("button", { name: /summary\.md/ });
    click(/summary\.md/);

    expect(screen.queryByRole("button", { name: "Compare versions" })).toBeNull();
  });

  it.each([
    [413, "Artifact versions are too large to compare."],
    [415, "This artifact type cannot be compared."],
  ])("shows the server's diff error for status %s", async (status, message) => {
    stubApi(undefined, {
      diffError: {
        status,
        code: status === 413 ? "artifact.diff_too_large" : "artifact.diff_unsupported_media_type",
        message,
      },
    });
    render(<App />);
    await openRun();
    click("Artifacts");
    await screen.findByText(/Artifact Workspace/);
    click(/summary\.md/);
    click("Compare versions");

    expect(await screen.findByText(message)).toBeTruthy();
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
