import { ImageResponse } from "next/og";
import { appName } from "./shared";

const size = { width: 1200, height: 630 };
const accent = "#62bfa8";
const deep = "#0f6e5c";

export function PlicoMark({ px }: { px: number }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        width: px,
        height: px,
        borderRadius: px * 0.23,
        backgroundColor: deep,
        color: "white",
        fontSize: px * 0.62,
        fontWeight: 700,
      }}
    >
      P
      <svg
        width={px}
        height={px}
        viewBox="0 0 104 104"
        style={{ position: "absolute", top: 0, left: 0 }}
        role="presentation"
      >
        <path d="M67 11 93 37H73a6 6 0 0 1-6-6Z" fill={accent} />
      </svg>
    </div>
  );
}

/** The 1200x630 social card shared by the homepage and every docs page. */
export function ogImage(title: string, description?: string): ImageResponse {
  const long = title.length > 28;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        color: "#e7ecea",
        backgroundColor: "#0b0d0d",
        backgroundImage: `radial-gradient(circle at 85% 0%, rgba(98,191,168,0.25), rgba(98,191,168,0) 60%)`,
        borderBottom: `14px solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <PlicoMark px={64} />
        <div style={{ fontSize: 40, fontWeight: 700 }}>{appName}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <div style={{ fontSize: long ? 68 : 88, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
        {description ? (
          <div style={{ fontSize: 34, color: "#a0aaa7", marginTop: 24, lineHeight: 1.3 }}>
            {description}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: accent }}>
        plico.sohab.dev
      </div>
    </div>,
    size,
  );
}
