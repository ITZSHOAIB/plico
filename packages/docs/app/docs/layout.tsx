import { Banner } from "fumadocs-ui/components/banner";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import Link from "next/link";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <Banner id="pre-release" variant="rainbow" rainbowColors={["#0a5547", "#62bfa8", "#8dd4c2"]}>
        <span className="text-white">
          Plico is pre-release: packages are not on npm yet.{" "}
          <Link href="/docs/quickstart" className="font-semibold underline underline-offset-4">
            Build from source
          </Link>
        </span>
      </Banner>
      <DocsLayout
        tree={source.getPageTree()}
        {...baseOptions()}
        nav={{ ...baseOptions().nav, mode: "top" }}
        sidebar={{ defaultOpenLevel: 1 }}
      >
        {children}
      </DocsLayout>
    </>
  );
}
