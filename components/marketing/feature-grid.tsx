import {
  AtSign,
  Boxes,
  ListFilter,
  Paperclip,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Search,
    title: "Full-text search",
    description:
      "Find any issue by title or description in milliseconds, scoped to your workspace.",
  },
  {
    icon: ListFilter,
    title: "Saved views",
    description:
      "Slice the backlog by status, assignee, label, or cycle - then save the view for the team.",
  },
  {
    icon: Paperclip,
    title: "Attachments",
    description:
      "Drop logs, screenshots, and specs straight onto the issue. Stored alongside the work.",
  },
  {
    icon: AtSign,
    title: "Mentions & threads",
    description:
      "Pull the right person into the conversation with @mentions that notify instantly.",
  },
  {
    icon: Users,
    title: "Live presence",
    description:
      "See who's viewing an issue right now, so you never collide on an edit or a triage call.",
  },
  {
    icon: Boxes,
    title: "Multi-team workspaces",
    description:
      "Each team gets its own key, board, and cycles - ENG-142 means the same thing to everyone.",
  },
];

export function FeatureGrid() {
  return (
    <Section>
      <SectionHeading
        eyebrow="05 · Everything else"
        title="All the table stakes, none of the bloat"
        lede="The features you expect from a serious tracker - built in, fast, and out of your way."
        align="center"
      />
      <div className="mt-14 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="group bg-background p-6 transition-colors hover:bg-muted/40"
          >
            <span className="flex size-8 items-center justify-center rounded-md border bg-muted/50 transition-colors group-hover:border-ring/50">
              <Icon className="size-4 text-foreground/80" />
            </span>
            <h3 className="mt-4 text-sm font-medium">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
