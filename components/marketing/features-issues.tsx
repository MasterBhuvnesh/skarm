import { Activity, AtSign, GitBranch, Zap } from "lucide-react";
import { FeatureBullet } from "@/components/marketing/feature-bullet";
import { MockIssueDetail } from "@/components/marketing/mock-issue-detail";
import { Section, SectionHeading } from "@/components/marketing/section";

export function FeaturesIssues() {
  return (
    <Section id="issues">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            eyebrow="01 · Issues"
            title="Issues that move at the speed of thought"
            lede="Create in seconds, triage with single keys, and never hit refresh every change syncs to every teammate in real time."
          />
          <div className="mt-10 grid gap-7 sm:grid-cols-2">
            <FeatureBullet
              icon={Zap}
              title="Fast by default"
              description="Optimistic updates land before your hand leaves the keyboard. No spinners between you and the work."
            />
            <FeatureBullet
              icon={GitBranch}
              title="Sub-issues & relations"
              description="Break work down, mark blockers and duplicates, and keep every dependency visible."
            />
            <FeatureBullet
              icon={AtSign}
              title="Comments & @mentions"
              description="Discussion lives on the issue mention a teammate and they're in the loop instantly."
            />
            <FeatureBullet
              icon={Activity}
              title="A full audit trail"
              description="Every status change, assignment, and edit lands in the activity feed automatically."
            />
          </div>
        </div>
        <MockIssueDetail />
      </div>
    </Section>
  );
}
