"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/ui/switch";

const CHANNELS = [
  {
    key: "mention",
    label: "Mentions",
    description: "Someone @mentions you.",
  },
  {
    key: "assigned",
    label: "Assignments",
    description: "An issue is assigned to you.",
  },
  {
    key: "statusChanged",
    label: "Status changes",
    description: "Issues you created or are assigned to change status.",
  },
  {
    key: "github",
    label: "GitHub activity",
    description: "Events from the GitHub integration.",
  },
] as const;

/**
 * Notification settings: per-channel toggles for the in-app inbox. Wired to
 * the reactive getPrefs query, so toggles feel instant without a toast.
 */
export default function NotificationsSettingsPage() {
  const prefs = useQuery(api.notifications.getPrefs);
  const setPref = useMutation(api.notifications.setPref);

  return (
    <>
      <div>
        <h1 className="text-base font-semibold">Notifications</h1>
        <p className="text-xs text-muted-foreground">
          Choose which in-app notifications you receive in this workspace.
        </p>
      </div>
      {prefs === undefined ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {CHANNELS.map(({ key, label, description }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={prefs[key]}
                onCheckedChange={(enabled) => setPref({ key, enabled })}
                aria-label={label}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
