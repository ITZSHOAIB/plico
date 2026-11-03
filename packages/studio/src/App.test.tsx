// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(
      screen.getByText(/Showing the current workspace, not the workspace at the selected event/i),
    ).toBeTruthy();
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
