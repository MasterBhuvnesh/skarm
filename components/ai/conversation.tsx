"use client";

import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AiMessage } from "./message";

/** Streaming message list for one thread (delta-synced over the websocket). */
export function AiConversation({ threadId }: { threadId: string }) {
  const { results, status, loadMore } = useUIMessages(
    api.agent.chat.listMessages,
    { threadId },
    { initialNumItems: 50, stream: true }
  );
  const messages = results as unknown as UIMessage[];

  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Track whether the user has scrolled away from the bottom; only then do
  // we stop following the stream.
  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    pinnedToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Follow new content (message count + streamed characters).
  const streamLength = messages.reduce(
    (total, message) => total + message.text.length,
    0
  );
  useEffect(() => {
    const el = containerRef.current;
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, streamLength]);

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        {status === "CanLoadMore" && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center text-xs text-muted-foreground"
            onClick={() => loadMore(50)}
          >
            Load earlier messages
          </Button>
        )}
        {messages.map((message) => (
          <AiMessage key={message.key} message={message} />
        ))}
        {messages.length > 0 &&
          messages[messages.length - 1].role === "user" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Skarm is thinking…
            </div>
          )}
      </div>
    </div>
  );
}
