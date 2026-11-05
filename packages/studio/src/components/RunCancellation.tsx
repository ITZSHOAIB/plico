import { useState } from "react";
import { requestRunCancellation } from "../api";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Page";

export function RunCancellation({ runId }: { runId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestRunCancellation(runId);
      if (result === "accepted") setRequested(true);
      else if (result === "ignored") setError("This run is already finished or cancelled.");
      else setError("The execution engine does not know this run.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request run cancellation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Run cancellation" className="flex flex-wrap items-center gap-2 px-4 py-3">
      {error ? (
        <Notice>{error}</Notice>
      ) : requested ? (
        <p role="status" className="m-0 text-small text-muted">
          Cancellation requested. Waiting for the run to stop.
        </p>
      ) : (
        <Button disabled={submitting} onClick={() => void cancel()}>
          {submitting ? "Requesting cancellation…" : "Cancel run"}
        </Button>
      )}
    </section>
  );
}
