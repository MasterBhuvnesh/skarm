import { ImageResponse } from "next/og";

// Native Next.js OG image convention: auto-used for OpenGraph and Twitter cards
// across the site. Generated from code, so there's no static asset to maintain.
export const alt = "Cohere - The AI-native issue tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.04em" }}>
          Cohere
        </div>
        <div style={{ fontSize: 40, color: "#a1a1a1", marginTop: 16 }}>
          The AI-native issue tracker for modern teams
        </div>
      </div>
    ),
    size
  );
}
