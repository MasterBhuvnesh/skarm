"use client";

import { useQuery } from "convex/react";
import { GitMerge, GitPullRequest, GitPullRequestClosed } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Separator } from "@/components/ui/separator";
import { IssueDetailSlotProps } from "./slots";

const STATE_ICONS = {
  open: <GitPullRequest className="size-3.5 shrink-0 text-green-500" />,
  merged: <GitMerge className="size-3.5 shrink-0 text-purple-500" />,
  closed: <GitPullRequestClosed className="size-3.5 shrink-0 text-red-500" />,
} as const;

/** Pull requests linked via the GitHub integration (branch/title mentions). */
export function PullRequestsPanel({ issue }: IssueDetailSlotProps) {
  const pullRequests = useQuery(api.integrations.listByIssue, {
    issueId: issue._id,
  });

  if (!pullRequests || pullRequests.length === 0) {
    return null;
  }

  return (
    <>
      <Separator className="my-4" />
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Pull requests
        </h3>
        {pullRequests.map((pr) => (
          <a
            key={pr._id}
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-accent"
            title={`${pr.repo} · by ${pr.authorLogin}`}
          >
            {STATE_ICONS[pr.state]}
            <span className="text-muted-foreground">#{pr.number}</span>
            <span className="truncate">{pr.title}</span>
          </a>
        ))}
      </div>
    </>
  );
}
