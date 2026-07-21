"use client";

import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { CheckCheck, Inbox, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/components/issue-detail/format";
import { GithubIcon } from "@/components/shared/github-icon";
import { STATUSES } from "@/components/shared/issue-meta";
import { cn } from "@/lib/utils";

type Notification = FunctionReturnType<typeof api.notifications.list>[number];

/** Tabs filter the already-fetched list client-side (it's capped at 50). */
const TABS: {
  value: string;
  label: string;
  empty: string;
  match: (n: Notification) => boolean;
}[] = [
  {
    value: "all",
    label: "All",
    empty:
      "No notifications yet. Mentions, assignments and status changes on your issues will show up here.",
    match: () => true,
  },
  {
    value: "mention",
    label: "Mentions",
    empty: "No mentions yet.",
    // "reply" isn't in the type union yet; compare as a string so it's picked
    // up when another track adds it, without declaring the type here.
    match: (n) => n.type === "mention" || (n.type as string) === "reply",
  },
  {
    value: "assigned",
    label: "Assigned",
    empty: "No assignments yet.",
    match: (n) => n.type === "assigned",
  },
  {
    value: "status",
    label: "Status",
    empty: "No status changes yet.",
    match: (n) => n.type === "status_changed" && !n.systemActor,
  },
  {
    value: "github",
    label: "GitHub",
    empty: "No GitHub activity yet.",
    match: (n) => n.systemActor === "github",
  },
];

function actionText(notification: {
  type: "mention" | "assigned" | "status_changed" | "reply";
  newValue?: string;
}): string {
  switch (notification.type) {
    case "mention":
      return "mentioned you on";
    case "reply":
      return "replied to your comment on";
    case "assigned":
      return "assigned you";
    case "status_changed": {
      const label =
        STATUSES.find((s) => s.value === notification.newValue)?.label ??
        notification.newValue;
      return `moved to ${label}`;
    }
  }
}

export default function InboxPage() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const notifications = useQuery(api.notifications.list);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [tab, setTab] = useState("mention");

  const unread = notifications?.filter((n) => !n.read).length ?? 0;
  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[0];
  const filtered = notifications?.filter(activeTab.match) ?? [];

  const open = (notification: {
    _id: Id<"notifications">;
    issueId: Id<"issues">;
    read: boolean;
  }) => {
    if (!notification.read) {
      markRead({ notificationId: notification._id });
    }
    router.push(`/${params.orgSlug}/issue/${notification.issueId}`);
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Inbox</span>
          {unread > 0 && (
            <span className="text-xs text-muted-foreground">
              {unread} unread
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={unread === 0}
          onClick={() => markAllRead()}
        >
          <CheckCheck className="size-4" />
          Mark all read
        </Button>
      </header>
      <div className="flex h-9 shrink-0 items-center border-b px-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-7">
            {TABS.map((t) => {
              const count =
                notifications?.filter((n) => !n.read && t.match(n)).length ?? 0;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-6 gap-1 px-2 text-xs"
                >
                  {t.label}
                  {count > 0 && (
                    <span className="text-muted-foreground">{count}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {notifications === undefined ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-32 text-center">
            <Inbox className="size-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{activeTab.empty}</p>
          </div>
        ) : (
          filtered.map((notification) => (
            <button
              key={notification._id}
              onClick={() => open(notification)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-4 py-3 text-left text-sm transition-colors hover:bg-accent",
                notification.read && "opacity-60"
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  notification.read ? "bg-transparent" : "bg-primary"
                )}
              />
              {notification.systemActor === "github" ? (
                <GithubIcon className="mt-0.5 size-5 shrink-0" />
              ) : notification.actorImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={notification.actorImageUrl}
                  alt=""
                  className="mt-0.5 size-5 shrink-0 rounded-full"
                />
              ) : (
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {notification.actorName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <span className="font-medium">{notification.actorName}</span>{" "}
                  <span className="text-muted-foreground">
                    {actionText(notification)}
                  </span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {notification.identifier}
                  </span>{" "}
                  {notification.issueTitle}
                </span>
                {notification.commentBody && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    “{notification.commentBody}”
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(notification._creationTime)}
              </span>
            </button>
          ))
        )}
      </ScrollArea>
    </>
  );
}
