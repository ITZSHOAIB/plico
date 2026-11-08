import type { Metadata } from "next";
import { Provider } from "@/components/provider";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://plico.sohab.dev"),
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
