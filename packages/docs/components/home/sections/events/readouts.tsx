import { RUN_ID, type runEvents } from "./data";

type Seen = typeof runEvents;

/** `plico events <id>`, as the CLI prints it */
export function Cli({ seen }: { seen: Seen }) {
  return (
    <pre>
      <span className="ph-dim">$ plico events {RUN_ID}</span>
      {"\n"}Events for {RUN_ID}
      {seen.map((e) => `\n${e.sequence} ${e.type} ${JSON.stringify(e.payload)}`)}
    </pre>
  );
}

/** The same events as the API returns them */
export function Http({ seen }: { seen: Seen }) {
  return (
    <pre>
      <span className="ph-dim">GET /v1/runs/{RUN_ID}/events</span>
      {"\n["}
      {seen.map((e) => `\n  { "sequence": ${e.sequence}, "type": "${e.type}", … },`)}
      {"\n]"}
    </pre>
  );
}

/** Studio's run timeline, the newest event marked */
export function Studio({ seen }: { seen: Seen }) {
  return (
    <ol className="ph-timeline">
      {seen.map((e, i) => (
        <li key={e.sequence} data-current={i === seen.length - 1 ? "" : undefined}>
          <i aria-hidden />
          <span>{e.type}</span>
          <b>#{e.sequence}</b>
        </li>
      ))}
    </ol>
  );
}
