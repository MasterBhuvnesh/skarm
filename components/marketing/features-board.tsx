import { LayoutGrid, RefreshCcw, Target, TrendingUp } from "lucide-react";
import { FeatureBullet } from "@/components/marketing/feature-bullet";
import { MockBoard } from "@/components/marketing/mock-board";
import { MockCycle } from "@/components/marketing/mock-cycle";
import { Section, SectionHeading } from "@/components/marketing/section";

export function FeaturesBoard() {
  return (
    <Section id="cycles">
      <SectionHeading
        eyebrow="02 · Board & Cycles"
        title="Momentum you can measure"
        lede="Drag issues across a fluid board, plan work into auto-numbered cycles, and watch scope and progress update live as the team ships."
        align="center"
      />
      <div className="mt-14 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <MockBoard />
        <div className="space-y-6">
          <MockCycle />
          <div className="grid gap-6 rounded-xl border bg-card/50 p-5">
            <FeatureBullet
              icon={LayoutGrid}
              title="A board that keeps up"
              description="Fractional ordering means drops land exactly where you put them even mid-drag from a teammate."
            />
            <FeatureBullet
              icon={RefreshCcw}
              title="Cycles on rails"
              description="Two-week heartbeats, numbered automatically. Unfinished work rolls forward on its own."
            />
            <FeatureBullet
              icon={TrendingUp}
              title="Progress, computed"
              description="Scope, started, and completed counts are derived from the issues never hand-updated."
            />
            <FeatureBullet
              icon={Target}
              title="Projects across teams"
              description="Group work toward an outcome and track health from one page, org-wide."
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
