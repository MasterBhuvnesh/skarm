"use client";

import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { MoreHorizontal } from "lucide-react";
import { ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentBody } from "@/components/issue-detail/comment-body";
import { CommentComposer } from "@/components/issue-detail/comment-composer";
import { formatRelativeTime } from "@/components/issue-detail/format";
import {
  MentionTextarea,
  resolveMentions,
} from "@/components/issue-detail/mention-textarea";
import { IssueDetailSlotProps } from "@/components/issue-detail/slots";
import {
  IssuePriority,
  IssueStatus,
  priorityLabel,
  statusLabel,
} from "@/components/shared/issue-meta";
import { GithubIcon } from "@/components/shared/github-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";

type EnrichedComment = FunctionReturnType<
  typeof api.comments.listByIssue
>[number];
type ActivityEntry = FunctionReturnType<
  typeof api.activity.listByIssue
>[number];

type FeedItem =
  | { kind: "comment"; time: number; key: string; comment: EnrichedComment }
  | { kind: "activity"; time: number; key: string; entry: ActivityEntry };

const RELATION_ADDED_PHRASES: Record<string, string> = {
  blocks: "marked this as blocking",
  blocked_by: "marked this as blocked by",
  related: "linked this issue to",
  duplicate_of: "marked this as a duplicate of",
  duplicated_by: "marked this as duplicated by",
};

function Emphasis({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** Sentence fragment describing an activity entry (actor name is prepended). */
function describeActivity(entry: ActivityEntry): ReactNode {
  const { type, field, oldValue, newValue } = entry;
  switch (type) {
    case "created":
      return <>created the issue</>;
    case "title_changed":
      return (
        <>
          renamed the issue to <Emphasis>{newValue}</Emphasis>
        </>
      );
    case "status_changed":
      return (
        <>
          changed status from{" "}
          <Emphasis>{statusLabel((oldValue ?? "") as IssueStatus)}</Emphasis> to{" "}
          <Emphasis>{statusLabel((newValue ?? "") as IssueStatus)}</Emphasis>
        </>
      );
    case "priority_changed":
      return (
        <>
          set priority to{" "}
          <Emphasis>
            {priorityLabel((newValue ?? "") as IssuePriority)}
          </Emphasis>
        </>
      );
    case "assignee_changed":
      if (newValue) {
        return (
          <>
            assigned <Emphasis>{newValue}</Emphasis>
          </>
        );
      }
      return (
        <>
          unassigned <Emphasis>{oldValue}</Emphasis>
        </>
      );
    case "parent_changed":
      if (newValue) {
        return (
          <>
            set the parent issue to <Emphasis>{newValue}</Emphasis>
          </>
        );
      }
      return (
        <>
          removed the parent issue <Emphasis>{oldValue}</Emphasis>
        </>
      );
    case "relation_added":
      return (
        <>
          {RELATION_ADDED_PHRASES[field ?? ""] ?? "linked this issue to"}{" "}
          <Emphasis>{newValue}</Emphasis>
        </>
      );
    case "relation_removed":
      return (
        <>
          removed the link to <Emphasis>{oldValue}</Emphasis>
        </>
      );
    case "attachment_added":
      return (
        <>
          attached <Emphasis>{newValue}</Emphasis>
        </>
      );
    case "attachment_removed":
      return (
        <>
          removed attachment <Emphasis>{oldValue}</Emphasis>
        </>
      );
    case "cycle_changed":
      // Values are raw cycle ids — not display-worthy, so stay generic.
      return newValue ? (
        <>moved this issue into a cycle</>
      ) : (
        <>removed this issue from its cycle</>
      );
    case "github_issue_created":
      return (
        <>
          created GitHub issue <Emphasis>{newValue}</Emphasis>
        </>
      );
    case "github_sync_failed":
      return (
        <>
          couldn&apos;t sync this issue to GitHub —{" "}
          <Emphasis>{newValue}</Emphasis>
        </>
      );
    default:
      if (field) {
        return (
          <>
            updated {field}
            {newValue ? (
              <>
                {" "}
                to <Emphasis>{newValue}</Emphasis>
              </>
            ) : null}
          </>
        );
      }
      return <>updated the issue</>;
  }
}

export function ActivitySection({ issue }: IssueDetailSlotProps) {
  const comments = useQuery(api.comments.listByIssue, { issueId: issue._id });
  const activity = useQuery(api.activity.listByIssue, { issueId: issue._id });
  const members = useQuery(api.organizations.listMembers);
  const currentUser = useQuery(api.users.current);
  const [filter, setFilter] = useState<"all" | "comments">("all");

  const isAdmin =
    members?.find((member) => member.userId === currentUser?._id)?.role ===
    "admin";

  const items = useMemo<FeedItem[]>(() => {
    const feed: FeedItem[] = (comments ?? []).map((comment) => ({
      kind: "comment",
      time: comment._creationTime,
      key: comment._id,
      comment,
    }));
    if (filter === "all") {
      for (const entry of activity ?? []) {
        // Comments render themselves — skip their "commented" log entries.
        if (entry.type === "commented") {
          continue;
        }
        feed.push({
          kind: "activity",
          time: entry._creationTime,
          key: entry._id,
          entry,
        });
      }
    }
    return feed.sort((a, b) => a.time - b.time);
  }, [comments, activity, filter]);

  const loading = comments === undefined || activity === undefined;

  return (
    <section className="flex flex-col gap-3 pt-4">
      <Separator />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Activity</h3>
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {(["all", "comments"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={cn(
                "h-6 rounded-sm px-2 text-xs capitalize text-muted-foreground transition-colors",
                filter === option && "bg-accent text-accent-foreground"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          No comments yet — start the conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "comment" ? (
              <CommentItem
                key={item.key}
                comment={item.comment}
                isOwn={item.comment.authorId === currentUser?._id}
                isAdmin={isAdmin}
              />
            ) : (
              <div
                key={item.key}
                className="flex items-center gap-2 pl-1 text-xs text-muted-foreground"
              >
                {item.entry.systemActor === "github" ? (
                  <GithubIcon className="size-4 shrink-0" />
                ) : (
                  <UserAvatar
                    name={item.entry.actorName}
                    imageUrl={item.entry.actorImageUrl}
                    className="size-4"
                  />
                )}
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    {item.entry.actorName}
                  </span>{" "}
                  {describeActivity(item.entry)}
                </span>
                <span className="ml-auto shrink-0">
                  {formatRelativeTime(item.entry._creationTime)}
                </span>
              </div>
            )
          )}
        </div>
      )}

      <CommentComposer issueId={issue._id} />
    </section>
  );
}

function CommentItem({
  comment,
  isOwn,
  isAdmin,
}: {
  comment: EnrichedComment;
  isOwn: boolean;
  isAdmin: boolean;
}) {
  const updateComment = useMutation(api.comments.update);
  const removeComment = useMutation(api.comments.remove);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const trackedMentions = useRef(new Map<Id<"users">, string>());

  const startEditing = () => {
    setDraft(comment.body);
    trackedMentions.current = new Map(
      comment.mentionedUsers.map((user) => [user.userId, user.name])
    );
    setEditing(true);
  };

  const saveEdit = async () => {
    const body = draft.trim();
    if (!body || saving) {
      return;
    }
    setSaving(true);
    try {
      await updateComment({
        commentId: comment._id,
        body,
        mentions: resolveMentions(body, trackedMentions.current),
      });
      setEditing(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update comment"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    removeComment({ commentId: comment._id }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete comment"
      );
    });
  };

  return (
    <div className="rounded-lg border bg-card/50">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <UserAvatar name={comment.authorName} imageUrl={comment.authorImageUrl} />
        <span className="text-xs font-medium">{comment.authorName}</span>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(comment._creationTime)}
        </span>
        {(isOwn || isAdmin) && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6 text-muted-foreground"
                aria-label="Comment actions"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwn && (
                <DropdownMenuItem onSelect={startEditing}>
                  Edit comment
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
                Delete comment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="px-3 pb-3 pt-1.5">
        {editing ? (
          <div>
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              onMention={({ userId, name }) =>
                trackedMentions.current.set(userId, name)
              }
              onSubmit={() => void saveEdit()}
              autoFocus
              disabled={saving}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7"
                disabled={!draft.trim() || saving}
                onClick={() => void saveEdit()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <CommentBody
            body={comment.body}
            mentionedUsers={comment.mentionedUsers}
          />
        )}
      </div>
    </div>
  );
}
