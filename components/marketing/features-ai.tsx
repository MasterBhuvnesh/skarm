import { Crosshair, FileText, MessagesSquare, Workflow } from "lucide-react";
import { FeatureBullet } from "@/components/marketing/feature-bullet";
import { MockAiChat } from "@/components/marketing/mock-ai-chat";
import { Section, SectionHeading } from "@/components/marketing/section";

export function FeaturesAi() {
  return (
    <Section id="ai" className="overflow-hidden">
      {/* A single restrained glow distinguishes the AI section. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(ellipse_50%_40%_at_70%_20%,color-mix(in_oklch,var(--foreground),transparent_95%),transparent)]"
      />
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <MockAiChat className="order-last lg:order-first" />
        <div>
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Included in Pro & Enterprise
          </div>
          <SectionHeading
            eyebrow="03 · AI Agent"
            title="An AI agent on the roster"
            lede="Skarm's agent works inside your workspace with org-scoped tools it files issues, summarizes cycles, drafts standups, and catches duplicates before they ship."
          />
          <div className="mt-10 grid gap-7 sm:grid-cols-2">
            <FeatureBullet
              icon={MessagesSquare}
              title="Chat with context"
              description="It knows your teams, cycles, and backlog answers come from your data, not the void."
            />
            <FeatureBullet
              icon={Workflow}
              title="Tools, not just talk"
              description="Creates, updates, and searches issues with the same permission checks as any member."
            />
            <FeatureBullet
              icon={FileText}
              title="Reports on demand"
              description="Standups and cycle summaries written from real activity, ready to paste anywhere."
            />
            <FeatureBullet
              icon={Crosshair}
              title="Duplicate radar"
              description="Semantic search over every issue flags lookalikes the moment something is filed."
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
