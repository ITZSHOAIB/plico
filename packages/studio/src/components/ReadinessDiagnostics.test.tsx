// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReadinessDiagnostics } from "./ReadinessDiagnostics";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows diagnostics with the same message on different paths without key warnings", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ReadinessDiagnostics
      diagnostics={[
        { severity: "warning", subsystem: "project", message: "Missing file", path: "one.md" },
        { severity: "warning", subsystem: "project", message: "Missing file", path: "two.md" },
      ]}
    />,
  );
  expect(screen.getByText(/one\.md/)).toBeTruthy();
  expect(screen.getByText(/two\.md/)).toBeTruthy();
  expect(screen.getAllByText("Missing file")).toHaveLength(2);
  expect(error).not.toHaveBeenCalled();
});
