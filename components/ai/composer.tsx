"use client";

import { ArrowUp } from "lucide-react";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AiComposer({
  disabled,
  disabledReason,
  onSend,
}: {
  disabled: boolean;
  disabledReason?: string;
  onSend: (prompt: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const prompt = text.trim();
    if (!prompt || disabled || sending) {
      return;
    }
    setSending(true);
    setText("");
    try {
      await onSend(prompt);
    } catch {
      // Caller surfaces the error; restore the draft so nothing is lost.
      setText(prompt);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t p-4">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-lg border bg-background p-2 focus-within:ring-1 focus-within:ring-ring"
      >
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? (disabledReason ?? "AI is unavailable")
              : "Ask Skarm to create, find or report on issues…"
          }
          disabled={disabled || sending}
          rows={1}
          className="max-h-40 min-h-9 flex-1 resize-none border-none bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          className="size-7 shrink-0"
          disabled={disabled || sending || !text.trim()}
        >
          <ArrowUp className="size-4" />
        </Button>
      </form>
      <p className="mx-auto mt-1.5 max-w-2xl px-1 text-[10px] text-muted-foreground">
        Skarm can create and edit issues in your workspace. Enter to send,
        Shift+Enter for a new line.
      </p>
    </div>
  );
}
