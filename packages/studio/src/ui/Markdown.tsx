import { Check, Copy } from "lucide-react";
import { type ComponentProps, isValidElement, type ReactNode, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { closeOpenMarkdown } from "./markdown-stream";

const plugins = [remarkGfm];

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node: _node, ...props }) => (
    <div className="markdown-table">
      <table {...props} />
    </div>
  ),
};

/**
 * Renders model output as Markdown. Raw HTML is dropped, never rendered: replies come from a
 * model and Studio can approve tool calls.
 */
export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="markdown" data-streaming={streaming || undefined}>
      <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
        {streaming ? closeOpenMarkdown(text) : text}
      </ReactMarkdown>
    </div>
  );
}

function languageOf(children: ReactNode): string | undefined {
  if (!isValidElement<ComponentProps<"code">>(children)) return undefined;
  return children.props.className?.match(/language-([\w+-]+)/)?.[1];
}

function CodeBlock({ children }: { children: ReactNode }) {
  const code = useRef<HTMLPreElement>(null);
  const language = languageOf(children);
  return (
    <div className="markdown-code">
      <div className="markdown-code-bar">
        <span>{language ?? "text"}</span>
        <CopyButton text={() => code.current?.textContent ?? ""} label="Copy code" />
      </div>
      {/* Focusable so keyboard users can scroll long lines. */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region needs keyboard access */}
      <pre ref={code} tabIndex={0}>
        {children}
      </pre>
    </div>
  );
}

export function CopyButton({
  text,
  label,
  className = "",
}: {
  text: () => string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-faint transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${className}`}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
