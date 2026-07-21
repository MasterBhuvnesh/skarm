import { ConvexHttpClient } from "convex/browser";
import { ImageResponse } from "next/og";
import { api } from "@/convex/_generated/api";
import { statusLabel } from "@/components/shared/issue-meta";

/** Link-preview card for shared issues (Slack/Twitter/iMessage unfurls). */
export const alt = "Shared issue on Skarm";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const issue = await convex.query(api.share.getByToken, { token });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        {issue ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 32,
                color: "#a1a1a1",
                fontFamily: "monospace",
              }}
            >
              {issue.identifier} · {statusLabel(issue.status)}
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                marginTop: 24,
                lineHeight: 1.15,
              }}
            >
              {issue.title.length > 90
                ? `${issue.title.slice(0, 87)}…`
                : issue.title}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 64, fontWeight: 700 }}>Shared issue</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 36, fontWeight: 700 }}>Skarm</div>
          <div style={{ fontSize: 30, color: "#a1a1a1" }}>
            {issue ? `Shared from ${issue.orgName}` : "The AI-native issue tracker"}
          </div>
        </div>
      </div>
    ),
    size
  );
}
