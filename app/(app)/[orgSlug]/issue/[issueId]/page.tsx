"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { IssueProperties } from "@/components/issue-detail/issue-properties";
import { ShareButton } from "@/components/issue-detail/share-button";
import {
  issueDetailMainSlots,
  issueDetailSidebarSlots,
} from "@/components/issue-detail/slots";

/**
 * Issue detail - foundation skeleton with extension slots. Track C fills in
 * comments/activity/attachments/relations; Track D adds AI triage panels.
 */
export default function IssueDetailPage() {
  const params = useParams<{ orgSlug: string; issueId: string }>();
  const issueId = params.issueId as Id<"issues">;
  const issue = useQuery(api.issues.get, { issueId });
  const team = useQuery(
    api.teams.get,
    issue ? { teamId: issue.teamId } : "skip"
  );

  if (issue === undefined || (issue && team === undefined)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (issue === null || !team) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Issue not found.
      </div>
    );
  }

  // Keying by issue id resets the editor's local state when navigating
  // between issues without effects fighting live updates.
  return (
    <IssueDetail
      key={issue._id}
      issue={issue}
      team={team}
      orgSlug={params.orgSlug}
    />
  );
}

function IssueDetail({
  issue,
  team,
  orgSlug,
}: {
  issue: Doc<"issues">;
  team: Doc<"teams">;
  orgSlug: string;
}) {
  const updateIssue = useMutation(api.issues.update);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);

  const identifier = `${team.key}-${issue.number}`;

  const saveTitle = () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === issue.title) {
      setTitle(issue.title);
      return;
    }
    updateIssue({ issueId: issue._id, title: trimmed }).catch(() => {
      toast.error("Failed to update title");
    });
  };

  const saveDescription = () => {
    setEditingDesc(false);
    if (description === (issue.description ?? "")) {
      return;
    }
    updateIssue({ issueId: issue._id, description }).catch(() => {
      toast.error("Failed to update description");
    });
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-4 text-sm">
        <Link
          href={`/${orgSlug}/team/${team._id}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {team.name}
        </Link>
        <ChevronRight className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">
          {identifier}
        </span>
        <ShareButton issueId={issue._id} />
      </header>
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="flex-1">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-8 py-8">
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              rows={1}
              className="min-h-0 resize-none border-none px-0 text-2xl font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {editingDesc || !description.trim() ? (
              <Textarea
                autoFocus={editingDesc}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                placeholder="Add description…"
                className="min-h-32 resize-none border-none px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingDesc(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingDesc(true);
                  }
                }}
                title="Edit description"
                className="min-h-32 cursor-text rounded-md"
              >
                <Streamdown className="text-sm leading-relaxed [&_a]:underline [&_code]:text-xs">
                  {description}
                </Streamdown>
              </div>
            )}
            {issueDetailMainSlots.map((Slot, index) => (
              <Slot key={index} issue={issue} team={team} />
            ))}
          </div>
        </ScrollArea>
        <aside className="w-72 shrink-0 overflow-y-auto border-l p-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">
            Properties
          </h3>
          <IssueProperties issue={issue} />
          {issueDetailSidebarSlots.length > 0 && <Separator className="my-4" />}
          {issueDetailSidebarSlots.map((Slot, index) => (
            <Slot key={index} issue={issue} team={team} />
          ))}
        </aside>
      </div>
    </>
  );
}
