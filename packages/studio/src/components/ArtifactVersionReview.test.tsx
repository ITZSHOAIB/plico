// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArtifactVersion } from "../types";
import { ArtifactVersionReview } from "./ArtifactVersionReview";

const version = (number: number): ArtifactVersion => ({
  path: "report.txt",
  mimeType: "text/plain",
  version: number,
  contentHash: `hash-${number}`,
  runId: `run-${number}`,
  createdAt: `2026-01-0${number}T00:00:00.000Z`,
});

describe("artifact version review", () => {
  it("defaults to the latest version when history grows", () => {
    const { rerender } = render(
      <ArtifactVersionReview runId="run-1" path="report.txt" versions={[version(1), version(2)]} />,
    );

    expect((screen.getByRole("combobox", { name: "To version" }) as HTMLSelectElement).value).toBe(
      "2",
    );

    rerender(
      <ArtifactVersionReview
        runId="run-1"
        path="report.txt"
        versions={[version(1), version(2), version(3)]}
      />,
    );

    expect((screen.getByRole("combobox", { name: "To version" }) as HTMLSelectElement).value).toBe(
      "3",
    );
  });
});
