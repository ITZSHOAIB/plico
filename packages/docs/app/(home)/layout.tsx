import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import "@/components/home/home.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="plico-home">
      <HomeLayout
        {...baseOptions()}
        links={[
          { text: "Docs", url: "/docs", active: "nested-url" },
          { text: "Quickstart", url: "/docs/quickstart" },
          // A plain text file: the client router would fetch it as a page and land on /llms.
          { text: "llms.txt", url: "/llms.txt", external: true },
        ]}
      >
        {children}
      </HomeLayout>
    </div>
  );
}
