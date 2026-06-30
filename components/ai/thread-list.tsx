"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThreadSummary = {
  threadId: string;
  title: string;
  createdAt: number;
};

export function ThreadList({
  threads,
  selectedThreadId,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: ThreadSummary[] | undefined;
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNew}
        >
          <Plus className="size-3.5" />
          New conversation
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          {threads?.map((thread) => (
            <div
              key={thread.threadId}
              className={cn(
                "group flex h-7 items-center gap-2 rounded-md pr-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                selectedThreadId === thread.threadId &&
                  "bg-accent text-foreground"
              )}
            >
              <button
                onClick={() => onSelect(thread.threadId)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left"
              >
                <MessageSquare className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete conversation"
                className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onDelete(thread.threadId)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
          {threads !== undefined && threads.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No conversations yet.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
