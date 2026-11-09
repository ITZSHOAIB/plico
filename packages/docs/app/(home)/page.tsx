import type { Metadata } from "next";
import { FilesSection } from "@/components/home/files-section";
import { Hero } from "@/components/home/hero";
import { KitSection } from "@/components/home/kit-section";
import { StartSection } from "@/components/home/start-section";
import { StatusSection } from "@/components/home/status-section";
import { ViewsSection } from "@/components/home/views-section";
import { appName, gitConfig, homeImageUrl, siteUrl } from "@/lib/shared";

const title = "Plico: build AI agents from files";
const description =
  "Plico is a TypeScript kit that turns a folder of Markdown and tools into a working AI agent with the harness included: runs, an event log, approvals, evals and a local Studio.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: appName,
    locale: "en_US",
    title,
    description,
    images: homeImageUrl,
  },
  twitter: { card: "summary_large_image", title, description, images: homeImageUrl },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Plico",
  description,
  url: siteUrl,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Node.js 22.18 or later",
  codeRepository: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
};

export default function HomePage() {
  return (
    <div className="ph-frame">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from our own content
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <FilesSection />
      <ViewsSection />
      <KitSection />
      <StatusSection />
      <StartSection />
    </div>
  );
}
