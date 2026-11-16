import { HomeLayout } from "fumadocs-ui/layouts/home";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { StatusBar } from "@/components/home/ui/status-bar";
import { baseOptions } from "@/lib/layout.shared";
import "@/components/home/styles/base.css";
import "@/components/home/styles/controls.css";
import "@/components/home/styles/dither-in.css";
import "@/components/home/styles/window.css";
import "@/components/home/styles/status-bar.css";
import "@/components/home/styles/hero.css";
import "@/components/home/styles/rig.css";
import "@/components/home/styles/computer.css";
import "@/components/home/styles/sections.css";
import "@/components/home/styles/drawing.css";
import "@/components/home/styles/views.css";
import "@/components/home/styles/board.css";
import "@/components/home/styles/kit.css";
import "@/components/home/styles/machines.css";
import "@/components/home/styles/start.css";

// Self-hosted with merged outlines; see components/home/fonts/README.md
const pixel = localFont({
  src: "../../components/home/fonts/geist-pixel-latin-400.woff2",
  variable: "--font-geist-pixel",
  display: "swap",
  adjustFontFallback: false,
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`plico-home ${pixel.variable}`}>
      <HomeLayout
        {...baseOptions()}
        links={[
          { text: "Docs", url: "/docs", active: "nested-url" },
          { text: "Quickstart", url: "/docs/quickstart" },
          { text: "llms.txt", url: "/llms.txt" },
        ]}
      >
        {children}
      </HomeLayout>
      <StatusBar />
    </div>
  );
}
