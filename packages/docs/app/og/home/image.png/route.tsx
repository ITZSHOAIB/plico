import { ogImage } from "@/lib/og-image";

export const dynamic = "force-static";

export function GET() {
  return ogImage(
    "Your agent is a folder of files.",
    "Markdown and TypeScript in. A runnable, inspectable agent out.",
  );
}
