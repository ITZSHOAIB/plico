import type { ArtifactFile } from "../types";
import { CodeBlock } from "../ui/Page";

function Markdown({ content }: { content: string }) {
  return (
    <div className="rounded-panel border border-line bg-surface p-4 leading-relaxed">
      {content.split("\n").map((line, i) => {
        const key = `l-${i}`;
        if (line.startsWith("# "))
          return (
            <h1 key={key} className="mt-2 mb-1 text-display font-semibold">
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith("## "))
          return (
            <h2 key={key} className="mt-2 mb-1 text-title font-semibold">
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith("### "))
          return (
            <h3 key={key} className="mt-1 mb-0.5 text-body font-semibold">
              {line.slice(4)}
            </h3>
          );
        if (line.trim() === "") return <br key={key} />;
        return (
          <p key={key} className="my-0.5">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export function FilePreview({ file }: { file: ArtifactFile }) {
  if (typeof file.content !== "string") {
    return (
      <div
        role="status"
        className="rounded-panel border border-line bg-surface p-4 text-small text-muted"
      >
        Binary preview is unavailable for this file.
      </div>
    );
  }

  if (file.mimeType === "application/json") {
    try {
      return <CodeBlock>{JSON.stringify(JSON.parse(file.content), null, 2)}</CodeBlock>;
    } catch {
      return <CodeBlock>{file.content}</CodeBlock>;
    }
  }

  if (file.mimeType === "text/markdown" || file.path.endsWith(".md")) {
    return <Markdown content={file.content} />;
  }

  return <CodeBlock className="text-fg">{file.content}</CodeBlock>;
}
