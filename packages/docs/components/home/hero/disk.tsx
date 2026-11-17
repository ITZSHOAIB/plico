import type { AgentFile } from "./rig-data";

/** The shell's outline: rounded corners, the top right cut away the way a 3.5" disk's is */
const SHELL = "M4 1H87.5L99 12.5V96Q99 99 96 99H4Q1 99 1 96V4Q1 1 4 1Z";

/**
 * A 3.5" floppy holding one of the agent's files: a graphite shell, a ridged metal shutter over
 * the hub, a write-protect tab and a density hole, and a paper label with the file's folder and
 * name. Every disk is the same; the label says which.
 */
export function Disk({ file }: { file: AgentFile }) {
  // a long name breaks once, before its extension
  const dot = file.name.indexOf(".");
  const long = file.name.indexOf(".", dot + 1) > 0;
  return (
    <div className="ph-disk">
      <svg
        className="ph-disk-shell"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="ph-disk-drop" d={SHELL} transform="translate(3.5 3.5)" />
        <path className="ph-disk-body" d={SHELL} />
        <path className="ph-disk-bevel" d="M5 4.5H86L95.5 14" />
      </svg>
      <span className="ph-disk-shutter">
        <i />
      </span>
      <span className="ph-disk-hole ph-disk-hole-l" />
      <span className="ph-disk-hole ph-disk-hole-r" />
      <span className="ph-disk-label">
        <small>{file.dir}</small>
        {long ? (
          <b>
            {file.name.slice(0, dot)}
            <br />
            {file.name.slice(dot)}
          </b>
        ) : (
          <b>{file.name}</b>
        )}
      </span>
    </div>
  );
}
