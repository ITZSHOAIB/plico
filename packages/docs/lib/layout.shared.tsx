import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BookOpen, Terminal } from "lucide-react";
import { appName, gitConfig } from "./shared";

function Brand() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className="inline-flex size-6 items-center justify-center rounded-md bg-fd-primary text-[13px] font-bold text-fd-primary-foreground"
      >
        P
      </span>
      {appName}
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Brand />,
      transparentMode: "top",
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      { icon: <BookOpen />, text: "Docs", url: "/docs", active: "nested-url" },
      { icon: <Terminal />, text: "CLI", url: "/docs/cli" },
    ],
  };
}
