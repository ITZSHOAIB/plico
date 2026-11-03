import type { ReplayPosition } from "../hooks/useReplayPosition";

export function ReplayControls({
  replay,
  eventsLoaded,
}: {
  replay: ReplayPosition;
  eventsLoaded: boolean;
}) {
  const { index, count, isLatest, previous, next, latest } = replay;
  if (count === 0) return eventsLoaded ? <div>No events yet</div> : null;
  return (
    <section aria-label="Run replay" style={{ marginBottom: "8px" }}>
      <button type="button" onClick={previous} disabled={index <= 0}>
        Previous event
      </button>
      <button type="button" onClick={next} disabled={index >= count - 1}>
        Next event
      </button>
      <button type="button" onClick={latest} disabled={isLatest}>
        Go to latest
      </button>
      <span role="status">
        {" "}
        Event {index + 1} of {count}
        {!isLatest && index < count - 1 && ` (${count - index - 1} newer)`}
      </span>
    </section>
  );
}
