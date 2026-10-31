import { codeBlock, codeBlockScroll } from "../styles";
import type { ArtifactFile } from "../types";

export function FilePreview({ file }: { file: ArtifactFile }) {
  if (file.mimeType === "application/json") {
    try {
      const parsed = JSON.parse(file.content);
      return <pre style={codeBlockScroll("70vh")}>{JSON.stringify(parsed, null, 2)}</pre>;
    } catch {
      return <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>{file.content}</pre>;
    }
  }

  if (file.mimeType === "text/markdown" || file.path.endsWith(".md")) {
    return (
      <div
        style={{
          ...codeBlockScroll("70vh"),
          whiteSpace: "normal",
          fontSize: "13px",
          lineHeight: "1.6",
        }}
      >
        {file.content.split("\n").map((line, i) => {
          const k = `l-${i}`;
          if (line.startsWith("# "))
            return (
              <h1 key={k} style={{ fontSize: "18px", margin: "8px 0 4px" }}>
                {line.slice(2)}
              </h1>
            );
          if (line.startsWith("## "))
            return (
              <h2 key={k} style={{ fontSize: "15px", margin: "6px 0 3px" }}>
                {line.slice(3)}
              </h2>
            );
          if (line.startsWith("### "))
            return (
              <h3 key={k} style={{ fontSize: "14px", margin: "4px 0 2px" }}>
                {line.slice(4)}
              </h3>
            );
          if (line.trim() === "") return <br key={k} />;
          return (
            <p key={k} style={{ margin: "2px 0" }}>
              {line}
            </p>
          );
        })}
      </div>
    );
  }

  return <pre style={{ ...codeBlock, ...codeBlockScroll("70vh") }}>{file.content}</pre>;
}
