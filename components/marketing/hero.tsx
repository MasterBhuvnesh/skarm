import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroShowcase } from "@/components/marketing/hero-showcase";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-10 text-center md:pt-14">
        <Link
          href="/#ai"
          className="group inline-flex items-center overflow-hidden rounded-full border bg-background text-sm shadow-sm transition-all duration-200 hover:shadow-md"
        >
          <span className="px-5 py-2 font-medium text-foreground">
            Introducing the AI agent
          </span>
          <span className="flex items-center gap-1 border-l bg-muted/50 px-4 py-2 font-medium text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
            Read more
            <ArrowUpRight className="size-3.5" />
          </span>
        </Link>

        <h1 className="mt-8 max-w-3xl text-5xl font-medium tracking-tighter text-balance md:text-7xl">
          Ship at the speed of thought
        </h1>
        <p className="mt-6 max-w-xl text-base text-balance text-muted-foreground md:text-lg">
          Cohere helps product teams plan, track, and ship faster in a keyboard-first workspace, powered by AI.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button size="lg" className="h-11 rounded-lg px-6" asChild>
            <Link href="/sign-up">
              Start for free
              {/* <ArrowRight className="size-4" /> */}
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-lg px-6 backdrop:blur-sm border border-border/50 bg-background/80 backdrop:backdrop-blur-sm "
            asChild
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Free for teams of 3 · No credit card required
        </p>
      </div>

      <HeroShowcase />
    </section>
  );
}
