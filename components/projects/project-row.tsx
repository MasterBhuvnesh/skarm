"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { UserAvatar } from "@/components/shared/user-avatar";
import { formatDay } from "./dates";
import { DEFAULT_PROJECT_COLOR, IssueProgress } from "./project-meta";
import { ProjectStatusIcon } from "./project-status-icon";
import { IssueProgressBar } from "./progress-bar";

export function ProjectRow({
  project,
}: {
  project: Doc<"projects"> & { progress: IssueProgress };
}) {
  const params = useParams<{ orgSlug: string }>();
  const members = useQuery(api.organizations.listMembers);
  const lead = members?.find((m) => m.userId === project.leadId);
  const activeIssues = project.progress.total - project.progress.canceled;

  return (
    <Link
      href={`/${params.orgSlug}/projects/${project._id}`}
      className="group flex h-11 items-center gap-3 border-b px-4 text-sm transition-colors hover:bg-accent/50"
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: project.color ?? DEFAULT_PROJECT_COLOR }}
      />
      <ProjectStatusIcon status={project.status} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {project.name}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">
        {activeIssues} {activeIssues === 1 ? "issue" : "issues"}
      </span>
      <IssueProgressBar
        progress={project.progress}
        showPercent
        className="hidden w-44 shrink-0 md:flex"
      />
      <span className="hidden w-14 shrink-0 text-right text-xs text-muted-foreground lg:block">
        {project.targetDate ? formatDay(project.targetDate) : "-"}
      </span>
      {lead ? (
        <UserAvatar name={lead.name} imageUrl={lead.imageUrl} />
      ) : (
        <span className="size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/40" />
      )}
    </Link>
  );
}
