// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { json, stubApi } from "./testing/fixtures";

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("overview", () => {
  it("is useful as the first screen", async () => {
    stubApi();
    render(<App />);

    const overview = await screen.findByRole("region", { name: "Project overview" });

    expect(within(overview).getByText("Internal Ops")).toBeTruthy();
    expect(within(overview).getByText(/current project and readiness/i)).toBeTruthy();
    expect(await within(overview).findByText("1 ok, 1 warning(s), 0 error(s)")).toBeTruthy();
    expect(await within(overview).findByText("Add more evals")).toBeTruthy();
    expect(within(overview).getByText("Checked at Oct 31, 2026, 10:00 AM UTC")).toBeTruthy();
    expect(await within(overview).findByText("1/2 passed, 1 failed")).toBeTruthy();
    expect(await within(overview).findByText(/1 run\(s\)/)).toBeTruthy();
    expect(await within(overview).findByText("agent.md, skills/triage.md")).toBeTruthy();
    expect(
      within(overview)
        .getByText("Instructions")
        .compareDocumentPosition(within(overview).getByText("Readiness")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("refreshes readiness from the project overview", async () => {
    const fetchMock = stubApi();
    const original = required(fetchMock.getMockImplementation());
    let reads = 0;
    fetchMock.mockImplementation(async (input, init) => {
      if (input === "/v1/readiness" && ++reads > 1)
        return json({
          projectRoot: "/demo",
          timestamp: "2026-01-01T00:00:00.000Z",
          summary: { ok: 1, warning: 0, error: 0 },
          diagnostics: [{ severity: "ok", subsystem: "project.structure", message: "All clear" }],
        });
      return original(input, init);
    });
    render(<App />);
    const overview = await screen.findByRole("region", { name: "Project overview" });
    await within(overview).findByText("Add more evals");
    fireEvent.click(within(overview).getByRole("button", { name: "Refresh readiness" }));
    expect(await within(overview).findByText("All clear")).toBeTruthy();
    expect(within(overview).queryByText("Add more evals")).toBeNull();
  });

  it("reports a readiness load failure and allows retry", async () => {
    const fetchMock = stubApi();
    const original = required(fetchMock.getMockImplementation());
    let reads = 0;
    fetchMock.mockImplementation(async (input, init) =>
      input === "/v1/readiness" && ++reads === 1
        ? json({ error: "unavailable" }, 500)
        : original(input, init),
    );
    render(<App />);
    const overview = await screen.findByRole("region", { name: "Project overview" });
    expect(await within(overview).findByText("Could not load readiness")).toBeTruthy();
    expect(within(overview).getByText("Unavailable")).toBeTruthy();
    fireEvent.click(within(overview).getByRole("button", { name: "Refresh readiness" }));
    expect(await within(overview).findByText("Add more evals")).toBeTruthy();
    expect(within(overview).queryByText("Could not load readiness")).toBeNull();
  });

  it("keeps the last readiness report and warns if refresh fails", async () => {
    const fetchMock = stubApi();
    const original = required(fetchMock.getMockImplementation());
    let reads = 0;
    fetchMock.mockImplementation(async (input, init) =>
      input === "/v1/readiness" && ++reads > 1
        ? json({ error: "unavailable" }, 500)
        : original(input, init),
    );
    render(<App />);
    const overview = await screen.findByRole("region", { name: "Project overview" });
    await within(overview).findByText("Add more evals");
    fireEvent.click(within(overview).getByRole("button", { name: "Refresh readiness" }));
    expect(await within(overview).findByText(/last successful report/i)).toBeTruthy();
    expect(within(overview).getByText("Add more evals")).toBeTruthy();
  });

  it("keeps the newest readiness report when refresh requests finish out of order", async () => {
    const fetchMock = stubApi();
    const original = required(fetchMock.getMockImplementation());
    let resolveOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    let reads = 0;
    fetchMock.mockImplementation(async (input, init) => {
      if (input !== "/v1/readiness") return original(input, init);
      reads++;
      if (reads === 2) return old;
      if (reads === 3)
        return json({
          projectRoot: "/demo",
          timestamp: "new",
          summary: { ok: 1, warning: 0, error: 0 },
          diagnostics: [{ severity: "ok", subsystem: "project", message: "Newest report" }],
        });
      return original(input, init);
    });
    render(<App />);
    const overview = await screen.findByRole("region", { name: "Project overview" });
    await within(overview).findByText("Add more evals");
    const refresh = within(overview).getByRole("button", { name: "Refresh readiness" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(await within(overview).findByText("Newest report")).toBeTruthy();
    await act(async () =>
      resolveOld(
        json({
          projectRoot: "/demo",
          timestamp: "old",
          summary: { ok: 0, warning: 1, error: 0 },
          diagnostics: [{ severity: "warning", subsystem: "project", message: "Old report" }],
        }),
      ),
    );
    expect(within(overview).queryByText("Old report")).toBeNull();
    expect(within(overview).getByText("Newest report")).toBeTruthy();
  });

  it("shows the same readiness error in the readiness view", async () => {
    const fetchMock = stubApi();
    const original = required(fetchMock.getMockImplementation());
    fetchMock.mockImplementation(async (input, init) =>
      input === "/v1/readiness" ? json({ error: "unavailable" }, 500) : original(input, init),
    );
    render(<App />);
    const overview = await screen.findByRole("region", { name: "Project overview" });
    await within(overview).findByText("Could not load readiness");
    fireEvent.click(screen.getByRole("button", { name: "Readiness" }));
    expect(await screen.findByText("Could not load readiness")).toBeTruthy();
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
