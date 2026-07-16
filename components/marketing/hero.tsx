import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FeatureTabs } from "@/components/marketing/feature-tabs";
import { MockApp } from "@/components/marketing/mock-app";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Faint blueprint grid, fading out from the top center. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[56px_56px] mask-[radial-gradient(ellipse_75%_60%_at_50%_0%,black_30%,transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-112 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,color-mix(in_oklch,var(--foreground),transparent_94%),transparent)]"
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 text-center md:pt-28">
        <Link
          href="/#ai"
          className="group flex items-center gap-2.5 rounded-full border bg-background py-1 pr-1 pl-3.5 text-[13px] shadow-sm transition-colors hover:border-ring/50"
        >
          <span className="font-medium text-foreground">
            Introducing the AI agent
          </span>
          <span className="flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground">
            Read more
            <ArrowUpRight className="size-3" />
          </span>
        </Link>

        <h1 className="mt-8 max-w-3xl text-5xl font-semibold tracking-tighter text-balance md:text-7xl">
          Ship at the speed of thought
        </h1>
        <p className="mt-6 max-w-xl text-base text-balance text-muted-foreground md:text-lg">
          Cohere is the AI-native issue tracker for modern teams — plan, track,
          and ship faster in a keyboard-first workspace.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button size="lg" className="h-11 rounded-lg px-6" asChild>
            <Link href="/sign-up">
              Start for free
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-lg px-6"
            asChild
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Free for teams of 3 · No credit card required
        </p>
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-6xl flex-col items-center px-6 md:mt-16">
        <FeatureTabs />
        <div className="relative mt-6 w-full md:mt-8">
          <MockApp />
          {/* Fade the bottom of the screenshot into the next section. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-px h-28 bg-linear-to-t from-background to-transparent"
          />
        </div>
      </div>
    </section>
  );
}
