import { useEffect, useRef, useState } from "react";
import { fetchArtifactDiff } from "../api";
import type { ArtifactDiff, ArtifactVersion } from "../types";
import { Button } from "../ui/Button";
import { CodeBlock, Notice, sectionHeadingClass } from "../ui/Page";

export function ArtifactVersionReview({
  runId,
  path,
  versions,
}: {
  runId: string;
  path: string;
  versions: ArtifactVersion[];
}) {
  const history = versions.filter((version) => version.path === path);
  const firstVersion = history[0]?.version ?? 1;
  const latestVersion = history.at(-1)?.version ?? firstVersion;
  const [fromVersion, setFromVersion] = useState(firstVersion);
  const [toVersion, setToVersion] = useState(latestVersion);
  const [diff, setDiff] = useState<ArtifactDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  useEffect(() => () => void request.current++, []);

  if (history.length < 2) return null;

  async function compare() {
    const currentRequest = ++request.current;
    setLoading(true);
    setError(null);
    setDiff(null);
    try {
      const result = await fetchArtifactDiff(runId, path, fromVersion, toVersion);
      if (currentRequest === request.current) setDiff(result);
    } catch {
      if (currentRequest === request.current)
        setError("Could not compare these artifact versions.");
    } finally {
      if (currentRequest === request.current) setLoading(false);
    }
  }

  return (
    <section aria-label="Artifact version history" className="mt-5">
      <h3 className={sectionHeadingClass}>Compare versions</h3>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-caption text-muted">
          From version
          <select
            value={fromVersion}
            onChange={(event) => setFromVersion(Number(event.currentTarget.value))}
            className="min-h-9 rounded-control border border-line bg-surface px-2 text-small text-fg"
          >
            {history.map((version) => (
              <option key={version.version} value={version.version}>
                v{version.version} · {version.createdAt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-muted">
          To version
          <select
            value={toVersion}
            onChange={(event) => setToVersion(Number(event.currentTarget.value))}
            className="min-h-9 rounded-control border border-line bg-surface px-2 text-small text-fg"
          >
            {history.map((version) => (
              <option key={version.version} value={version.version}>
                v{version.version} · {version.createdAt}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void compare()} disabled={loading || fromVersion === toVersion}>
          {loading ? "Comparing…" : "Compare versions"}
        </Button>
      </div>
      {error && <Notice>{error}</Notice>}
      {diff && (
        <section aria-label="Version diff" className="mt-3">
          <p className="mb-2 text-caption text-muted">
            {path} · v{diff.fromVersion} → v{diff.toVersion}
          </p>
          <CodeBlock>{diff.diff}</CodeBlock>
        </section>
      )}
    </section>
  );
}
