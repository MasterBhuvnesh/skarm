"use client";

import { Button } from "@/components/ui/button";
import { SkarmLogo } from "@/components/shared/skarm-logo";

/** Last-resort boundary for errors thrown in the root layout itself. Renders
    its own <html>/<body>, so styles are inlined-simple on purpose. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontFamily:
            "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0b0d",
          color: "#ededf0",
          textAlign: "center",
          padding: 24,
        }}
      >
        <SkarmLogo size={40} id="skarm-petal-global-error" tile />
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          Something broke badly
        </h1>
        <p style={{ fontSize: 14, color: "#8f8f9a", maxWidth: 380, margin: 0 }}>
          The app itself failed to render. Reloading usually fixes it.
          {error.digest ? ` (Error ${error.digest})` : ""}
        </p>
        <Button size="sm" onClick={reset} style={{ marginTop: 8 }}>
          Reload
        </Button>
      </body>
    </html>
  );
}
