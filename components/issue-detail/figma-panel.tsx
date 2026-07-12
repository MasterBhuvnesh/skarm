"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, RefreshCcw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";
import { FigmaIcon } from "@/components/shared/figma-icon";
import { formatRelativeTime } from "./format";
import { IssueDetailSlotProps } from "./slots";

/** Figma designs linked to this issue, with fetched thumbnails. */
export function FigmaPanel({ issue }: IssueDetailSlotProps) {
  const figma = useQuery(api.integrations.getFigma);
  const links = useQuery(api.figma.listByIssue, { issueId: issue._id });
  const addLink = useMutation(api.figma.addLink);
  const removeLink = useMutation(api.figma.removeLink);
  const refreshPreviews = useMutation(api.figma.refreshPreviews);

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");

  const connected = figma?.connection?.enabled ?? false;
  if (!connected && (links?.length ?? 0) === 0) {
    return null;
  }

  const submit = () => {
    const value = url.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    addLink({ issueId: issue._id, url: value })
      .then(() => {
        setUrl("");
        setAdding(false);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to add Figma link"
        );
      });
  };

  return (
    <>
      <Separator className="my-4" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">Figma</h3>
          {connected && (
            <span className="flex items-center gap-0.5">
              {(links?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    refreshPreviews({ issueId: issue._id }).catch(() =>
                      toast.error("Failed to refresh previews")
                    )
                  }
                  aria-label="Refresh previews"
                  title="Refresh names, thumbnails and edit times"
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RefreshCcw className="size-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding((a) => !a)}
                aria-label="Add Figma link"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </span>
          )}
        </div>

        {adding && (
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submit();
              }
              if (event.key === "Escape") {
                setAdding(false);
              }
            }}
            onBlur={submit}
            placeholder="Paste a Figma file or frame link…"
            className="h-7 rounded-md border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        )}

        {links?.map((link) => (
          <div
            key={link._id}
            className="group flex items-center gap-2 rounded-md border bg-card/50 p-1.5"
          >
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-2"
              title={link.name ?? link.url}
            >
              {link.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={link.thumbnailUrl}
                  alt=""
                  className="h-9 w-12 shrink-0 rounded border object-cover"
                />
              ) : (
                <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded border bg-muted/40">
                  <FigmaIcon className="h-4 w-2.5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {link.name ?? "Figma design"}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {link.lastModified
                    ? `edited ${formatRelativeTime(link.lastModified)}`
                    : link.url.replace(/^https:\/\/(www\.)?/, "")}
                  {link.inDevMode ? " · in Dev Mode" : ""}
                </span>
              </span>
            </a>
            <button
              type="button"
              onClick={() =>
                removeLink({ linkId: link._id as Id<"figmaLinks"> }).catch(
                  (error: unknown) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to remove link"
                    )
                )
              }
              aria-label="Remove Figma link"
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
