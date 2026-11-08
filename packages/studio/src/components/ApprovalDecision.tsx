import { useState } from "react";
import { sendApprovalDecision } from "../api";
import { inspectionReason, useInspecting } from "../hooks/useInspection";
import { Button } from "../ui/Button";
import { CodeBlock, Notice, sectionHeadingClass } from "../ui/Page";

interface ApprovalRequest {
  requestId: string;
  toolName: string;
  arguments: unknown;
  reason?: string;
}

export function ApprovalDecision({ runId, request }: { runId: string; request: ApprovalRequest }) {
  const inspecting = useInspecting();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approved: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendApprovalDecision(runId, request.requestId, approved);
      if (result !== "accepted") {
        setError("This approval is no longer waiting. Reload the run to see its latest state.");
        return;
      }
      setStatus(
        approved
          ? "Approval approved. The run is resuming."
          : "Tool call denied. The run is ending.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the approval decision.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label="Approval required"
      className="m-4 rounded-panel border border-warning/40 bg-warning-soft p-4"
    >
      <h3 className={sectionHeadingClass}>Approval required</h3>
      <p className="m-0 mb-2 text-small">
        <span className="text-muted">Tool call:</span> <code>{request.toolName}</code>
      </p>
      {request.reason && <p className="m-0 mb-3 text-small">{request.reason}</p>}
      <details className="mb-3">
        <summary className="cursor-pointer text-small text-muted">Arguments</summary>
        <CodeBlock className="mt-2">{JSON.stringify(request.arguments, null, 2)}</CodeBlock>
      </details>
      {error && <Notice>{error}</Notice>}
      {inspecting && <Notice>{inspectionReason}</Notice>}
      {status ? (
        <p role="status" className="m-0 text-small text-muted">
          {status}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={submitting || inspecting}
            onClick={() => void decide(true)}
          >
            {submitting ? "Sending…" : "Approve tool call"}
          </Button>
          <Button disabled={submitting || inspecting} onClick={() => void decide(false)}>
            Deny tool call
          </Button>
        </div>
      )}
    </section>
  );
}
