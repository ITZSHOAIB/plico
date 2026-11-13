import type { Metadata } from "next";
import { Provider } from "@/components/provider";
import { appName, homeImageUrl, siteUrl } from "@/lib/shared";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Plico docs", template: "%s | Plico" },
  description:
    "Plico is a TypeScript-first agent app kit: a folder of Markdown and TypeScript becomes a runnable, inspectable agent app.",
  // Next adds app/favicon.ico itself; listing icons here replaces the app/icon.svg convention.
  icons: { icon: { url: "/icon.svg", type: "image/svg+xml" }, apple: "/apple-icon.png" },
  openGraph: { siteName: appName, locale: "en_US", images: homeImageUrl },
  twitter: { card: "summary_large_image", images: homeImageUrl },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
