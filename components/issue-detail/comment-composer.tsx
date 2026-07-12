"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MentionTextarea,
  resolveMentions,
} from "@/components/issue-detail/mention-textarea";
import { FigmaIcon } from "@/components/shared/figma-icon";
import { UserAvatar } from "@/components/shared/user-avatar";

export function CommentComposer({ issueId }: { issueId: Id<"issues"> }) {
  const currentUser = useQuery(api.users.current);
  const createComment = useMutation(api.comments.create);
  const figmaLinks = useQuery(api.figma.listByIssue, { issueId });
  const [value, setValue] = useState("");
  const [postToFigma, setPostToFigma] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Users picked from the autocomplete; narrowed to surviving tokens on submit.
  const trackedMentions = useRef(new Map<Id<"users">, string>());

  const hasFigmaLinks = (figmaLinks?.length ?? 0) > 0;

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
        mentions: resolveMentions(body, trackedMentions.current),
        postToFigma: hasFigmaLinks && postToFigma ? true : undefined,
      });
      setValue("");
      trackedMentions.current.clear();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to post comment"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      {currentUser && (
        <UserAvatar
          name={currentUser.name}
          imageUrl={currentUser.imageUrl}
          className="mt-2.5 size-6"
        />
      )}
      <div className="flex-1 rounded-lg border bg-card/50 px-3 py-2 transition-colors focus-within:border-ring">
        <MentionTextarea
          value={value}
          onChange={setValue}
          onMention={({ userId, name }) =>
            trackedMentions.current.set(userId, name)
          }
          onSubmit={() => void submit()}
          placeholder="Leave a comment… (@ to mention)"
          disabled={submitting}
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          {hasFigmaLinks && (
            <label className="mr-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <Checkbox
                checked={postToFigma}
                onCheckedChange={(checked) => setPostToFigma(checked === true)}
                className="size-3.5"
              />
              <FigmaIcon className="h-3 w-2" />
              Also post to Figma
            </label>
          )}
          <span className="text-[11px] text-muted-foreground">⌘↵ to send</span>
          <Button
            size="sm"
            className="h-7"
            disabled={!value.trim() || submitting}
            onClick={() => void submit()}
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
