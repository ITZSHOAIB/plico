import type { ReplayPosition } from "../hooks/useReplayPosition";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";

function ReplayButton(props: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      size="icon-sm"
    >
      <Icon name={props.icon} />
    </Button>
  );
}

export function ReplayControls({
  replay,
  eventsLoaded,
}: {
  replay: ReplayPosition;
  eventsLoaded: boolean;
}) {
  const { index, count, isLatest, previous, next, latest } = replay;
  if (count === 0) {
    return eventsLoaded ? <div className="px-4 py-3 text-muted">No events yet</div> : null;
  }
  const progress = count > 1 ? (index / (count - 1)) * 100 : 100;
  return (
    <section
      aria-label="Run replay"
      className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:py-2.5 lg:pb-2.5"
    >
      <ReplayButton
        icon="previous"
        label="Previous event"
        onClick={previous}
        disabled={index <= 0}
      />
      <ReplayButton icon="next" label="Next event" onClick={next} disabled={index >= count - 1} />
      <ReplayButton icon="latest" label="Go to latest" onClick={latest} disabled={isLatest} />
      <span role="status" className="ml-1 text-muted tabular-nums">
        Event {index + 1} of {count}
        {!isLatest && index < count - 1 && ` (${count - index - 1} newer)`}
      </span>
      <div
        aria-hidden="true"
        className="relative order-last h-1 min-w-24 flex-1 rounded-full bg-line sm:order-none"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
