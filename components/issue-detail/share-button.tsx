"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Create/copy/revoke the public read-only link for an issue. */
export function ShareButton({ issueId }: { issueId: Id<"issues"> }) {
  const token = useQuery(api.share.getForIssue, { issueId });
  const create = useMutation(api.share.create);
  const revoke = useMutation(api.share.revoke);
  const [copied, setCopied] = useState(false);

  const url = token ? `${window.location.origin}/share/${token}` : null;

  const onError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : "Something went wrong");
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const createAndCopy = async () => {
    try {
      const newToken = await create({ issueId });
      copy(`${window.location.origin}/share/${newToken}`);
      toast.success("Public link copied to clipboard");
    } catch (error) {
      onError(error);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto h-7">
          <Share2 className="size-3.5" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        {url ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">Public read-only link</span>
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
                {url}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="Copy link"
                onClick={() => copy(url)}
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view the issue (no comments or
              attachments). Revoking kills the link instantly.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-destructive hover:text-destructive"
              onClick={() => revoke({ issueId }).catch(onError)}
            >
              Revoke link
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">Share this issue</span>
            <p className="text-xs text-muted-foreground">
              Create a public read-only link with a preview card — viewers
              don&apos;t need an account.
            </p>
            <Button size="sm" onClick={() => void createAndCopy()}>
              Create public link
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
