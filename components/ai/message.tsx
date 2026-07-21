"use client";

import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { getToolName, isToolUIPart } from "ai";
import { Streamdown } from "streamdown";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  listTeams: "Looking up teams",
  listMembers: "Looking up members",
  projectStatus: "Checking project status",
  searchIssues: "Searching issues",
  findSimilarIssues: "Finding similar issues",
  createIssue: "Creating issue",
  updateIssue: "Updating issue",
  cycleSummary: "Summarizing cycle",
  standupReport: "Gathering standup data",
};

function ToolChip({
  name,
  state,
  errorText,
}: {
  name: string;
  state: string;
  errorText?: string;
}) {
  const running = state === "input-streaming" || state === "input-available";
  const failed = state === "output-error";
  return (
    <span
      title={failed ? errorText : undefined}
      className="inline-flex w-fit items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
    >
      {running ? (
        <Loader2 className="size-3 animate-spin" />
      ) : failed ? (
        <CircleAlert className="size-3 text-destructive" />
      ) : (
        <CircleCheck className="size-3 text-emerald-500" />
      )}
      <Wrench className="size-3" />
      {TOOL_LABELS[name] ?? name}
    </span>
  );
}

function AssistantText({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [visibleText] = useSmoothText(text, { startStreaming: streaming });
  return (
    <Streamdown className="text-sm leading-relaxed [&_a]:underline [&_code]:text-xs">
      {visibleText}
    </Streamdown>
  );
}

/** One chat message: user prompt bubble or assistant parts (text + tools). */
export function AiMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">
          {message.text}
        </div>
      </div>
    );
  }

  const failed = message.status === "failed";
  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text) {
            return null;
          }
          return (
            <AssistantText
              key={index}
              text={part.text}
              streaming={message.status === "streaming"}
            />
          );
        }
        if (isToolUIPart(part)) {
          // Covers both static (`tool-*`) and dynamic tool parts.
          return (
            <ToolChip
              key={index}
              name={getToolName(part)}
              state={part.state}
              errorText={part.errorText}
            />
          );
        }
        return null;
      })}
      {failed && (
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs text-destructive",
            message.parts.length > 0 && "mt-1"
          )}
        >
          <CircleAlert className="size-3" />
          Skarm couldn&apos;t finish this response. Try sending your message
          again.
        </p>
      )}
    </div>
  );
}
