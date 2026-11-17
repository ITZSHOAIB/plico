import type { Metadata } from "next";
import { Hero } from "@/components/home/hero";
import { Views } from "@/components/home/sections/events";
import { Files } from "@/components/home/sections/files";
import { Film } from "@/components/home/sections/film";
import { Kit } from "@/components/home/sections/kit";
import { Start } from "@/components/home/sections/start";
import { Today } from "@/components/home/sections/today";
import { appName, gitConfig, homeImageUrl, siteUrl } from "@/lib/shared";

const title = "Plico: the agent harness for TypeScript";
const description =
  "Bring prompts and tools; Plico handles the harness. Write the job in Markdown and the tools in TypeScript, and Plico gives your agent durable runs, an event log, approvals, artifacts, evals and a local Studio.";

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
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
      <Film />
      <Files />
      <Views />
      <Kit />
      <Today />
      <Start />
    </div>
  );
}
