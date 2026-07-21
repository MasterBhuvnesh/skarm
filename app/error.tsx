"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SkarmLogo } from "@/components/shared/skarm-logo";

/** Branded error boundary - replaces the framework's default "This page
    couldn't load" screen. `reset` re-renders the failed segment. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <SkarmLogo size={40} id="skarm-petal-error" tile className="mb-2" />
      <p className="font-mono text-xs text-muted-foreground">
        Something went wrong
      </p>
      <h1 className="text-xl font-semibold">This page couldn&apos;t load</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error interrupted the page. It&apos;s usually temporary -
        try again, or head back to your workspace.
      </p>
      {error.digest && (
        <p className="font-mono text-[11px] text-muted-foreground/60">
          Error {error.digest}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
