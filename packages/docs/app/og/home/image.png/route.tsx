import { ogImage } from "@/lib/og-image";

export const dynamic = "force-static";

export function GET() {
  return ogImage(
    "Bring prompts and tools. Plico handles the harness.",
    "The agent harness for TypeScript.",
  );
}
