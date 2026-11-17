"use client";

import { Check, Clipboard } from "lucide-react";
import { Fragment, useState } from "react";
import { setStatus } from "../lib/status";

/** A shell command with a copy button; a copy prints to the status bar */
export function Command({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setStatus(`copied ${command}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className={`ph-command ${className ?? ""}`}>
      <code>
        <span aria-hidden>$</span>
        <span>
          {/* the spaces sit between the unbreakable words, so a narrow screen wraps there */}
          {command.split(" ").map((word, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: words of a fixed command
            <Fragment key={i}>
              {i > 0 ? " " : null}
              <span>{word}</span>
            </Fragment>
          ))}
        </span>
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy "${command}"`}
        className="ph-invert"
      >
        {copied ? <Check aria-hidden /> : <Clipboard aria-hidden />}
      </button>
    </div>
  );
}
