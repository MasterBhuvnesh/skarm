"use client";

import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { MoreHorizontal, SmilePlus } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentBody } from "@/components/issue-detail/comment-body";
import {
  REACTION_ICONS,
  reactionKey,
} from "@/components/issue-detail/reaction-icons";
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

/** Emoji offered in the reaction picker. */
const REACTION_EMOJIS = ["👍", "❤️", "😄", "🎉", "👀", "🚀"];

/** Freehand Duotone icon for a reaction, falling back to the raw emoji
    for values outside the fixed set (older data, future additions). */
function ReactionGlyph({
  emoji,
  className,
}: {
  emoji: string;
  className: string;
}) {
  const Icon = REACTION_ICONS[reactionKey(emoji)];
  return Icon ? <Icon className={className} /> : <span>{emoji}</span>;
}

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
    case "figma_linked":
      return <>linked a Figma design</>;
    case "cycle_changed":
      // Values are raw cycle ids - not display-worthy, so stay generic.
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
          couldn&apos;t sync this issue to GitHub -{" "}
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
    const feed: FeedItem[] = (comments ?? [])
      .filter((comment) => !comment.parentId)
      .map((comment) => ({
        kind: "comment",
        time: comment._creationTime,
        key: comment._id,
        comment,
      }));
    if (filter === "all") {
      for (const entry of activity ?? []) {
        // Comments render themselves - skip their "commented" log entries.
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

  // Replies grouped under their (root) parent; the feed shows top-level only.
  const repliesByParent = useMemo(() => {
    const map = new Map<Id<"comments">, EnrichedComment[]>();
    for (const comment of comments ?? []) {
      if (comment.parentId) {
        const list = map.get(comment.parentId) ?? [];
        list.push(comment);
        map.set(comment.parentId, list);
      }
    }
    return map;
  }, [comments]);

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
          No comments yet - start the conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "comment" ? (
              <CommentThread
                key={item.key}
                comment={item.comment}
                replies={repliesByParent.get(item.comment._id) ?? []}
                currentUserId={currentUser?._id}
                isAdmin={isAdmin}
                issueId={issue._id}
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
  isReply = false,
  onReply,
}: {
  comment: EnrichedComment;
  isOwn: boolean;
  isAdmin: boolean;
  isReply?: boolean;
  onReply?: () => void;
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
    <div className={isReply ? "flex flex-col" : "rounded-lg border bg-card/50"}>
      <div
        className={cn(
          "flex items-center gap-2",
          isReply ? "pt-0.5" : "px-3 pt-2.5"
        )}
      >
        {comment.external ? (
          <GithubIcon className={isReply ? "size-4" : "size-5"} />
        ) : (
          <UserAvatar
            name={comment.authorName}
            imageUrl={comment.authorImageUrl}
            className={isReply ? "size-5" : undefined}
          />
        )}
        <span className="text-xs font-medium">{comment.authorName}</span>
        {comment.external && (
          <span className="rounded-full border px-1.5 text-[10px] text-muted-foreground">
            via GitHub
          </span>
        )}
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
      <div className={isReply ? "pt-1" : "px-3 pb-3 pt-1.5"}>
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
          <>
            <CommentBody
              body={comment.body}
              mentionedUsers={comment.mentionedUsers}
            />
            <div className="mt-1.5">
              <ReactionRow
                comment={comment}
                isReply={isReply}
                onReply={onReply}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Grouped reaction pills plus an add-reaction picker and (top-level) Reply. */
function ReactionRow({
  comment,
  isReply,
  onReply,
}: {
  comment: EnrichedComment;
  isReply: boolean;
  onReply?: () => void;
}) {
  const toggleReaction = useMutation(api.comments.toggleReaction);
  const [pickerOpen, setPickerOpen] = useState(false);

  const react = (emoji: string) => {
    toggleReaction({ commentId: comment._id, emoji }).catch(
      (error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Failed to react");
      }
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {comment.reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          title={reaction.names.join(", ")}
          onClick={() => react(reaction.emoji)}
          className={cn(
            // Filled neutral chip so full-colour emoji (e.g. the near-white
            // 👀) keep contrast on both the light and dark comment surface.
            "flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
            reaction.reactedByMe
              ? "border-primary/30 bg-primary/15"
              : "bg-muted hover:bg-muted/70"
          )}
        >
          <ReactionGlyph emoji={reaction.emoji} className="size-3.5" />
          <span className="text-muted-foreground">{reaction.count}</span>
        </button>
      ))}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label="Add reaction"
          >
            <SmilePlus className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto flex-row gap-1 p-1.5">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                react(emoji);
                setPickerOpen(false);
              }}
              className="flex size-8 items-center justify-center rounded-md bg-muted/40 transition-colors hover:bg-accent"
              aria-label={`React with ${emoji}`}
            >
              <ReactionGlyph emoji={emoji} className="size-5" />
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {!isReply && onReply && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={onReply}
        >
          Reply
        </Button>
      )}
    </div>
  );
}

/** A top-level comment with its (one-level-deep) replies and reply composer. */
function CommentThread({
  comment,
  replies,
  currentUserId,
  isAdmin,
  issueId,
}: {
  comment: EnrichedComment;
  replies: EnrichedComment[];
  currentUserId: Id<"users"> | undefined;
  isAdmin: boolean;
  issueId: Id<"issues">;
}) {
  const [replying, setReplying] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <CommentItem
        comment={comment}
        isOwn={comment.authorId === currentUserId}
        isAdmin={isAdmin}
        onReply={() => setReplying((value) => !value)}
      />
      {(replies.length > 0 || replying) && (
        <div className="ml-8 flex flex-col gap-2 border-l pl-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply._id}
              comment={reply}
              isOwn={reply.authorId === currentUserId}
              isAdmin={isAdmin}
              isReply
            />
          ))}
          {replying && (
            <ReplyComposer
              issueId={issueId}
              parentId={comment._id}
              onDone={() => setReplying(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Inline composer for a reply; reuses the mention flow of the main composer. */
function ReplyComposer({
  issueId,
  parentId,
  onDone,
}: {
  issueId: Id<"issues">;
  parentId: Id<"comments">;
  onDone: () => void;
}) {
  const createComment = useMutation(api.comments.create);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trackedMentions = useRef(new Map<Id<"users">, string>());

  const submit = async () => {
    const body = value.trim();
    if (!body || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await createComment({
        issueId,
        body,
        parentId,
        mentions: resolveMentions(body, trackedMentions.current),
      });
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to post reply"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-lg border bg-card/50 px-3 py-2"
      onKeyDown={(e) => {
        // Esc closes, unless the mention popup already consumed the key.
        if (e.key === "Escape" && !e.defaultPrevented) {
          onDone();
        }
      }}
    >
      <MentionTextarea
        value={value}
        onChange={setValue}
        onMention={({ userId, name }) =>
          trackedMentions.current.set(userId, name)
        }
        onSubmit={() => void submit()}
        placeholder="Write a reply… (@ to mention)"
        autoFocus
        disabled={submitting}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-7" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7"
          disabled={!value.trim() || submitting}
          onClick={() => void submit()}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
