import { ImageResponse } from "next/og";
import { PlicoMark } from "@/lib/og-image";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<PlicoMark px={180} />, { width: 180, height: 180 });
}
