"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Settings = NonNullable<
  ReturnType<typeof useQuery<typeof api.emailDigests.getSettings>>
>;

const TIMES = [
  { value: "morning", label: "Morning", hint: "~8:00" },
  { value: "evening", label: "Evening", hint: "~18:00" },
  { value: "any", label: "Any time", hint: "~9:00" },
] as const;

const FREQUENCIES = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Specific days" },
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SECTIONS = [
  {
    key: "assigned",
    label: "Assigned to me",
    description: "Your open issues, so nothing sits forgotten.",
  },
  {
    key: "inProgress",
    label: "Still in progress",
    description: "What you have started but not finished.",
  },
  {
    key: "mentions",
    label: "Mentions & replies",
    description: "Comments that @mention you or reply to you since the last digest.",
  },
  {
    key: "focus",
    label: "Needs focus",
    description: "Overdue, due within 3 days, or marked urgent.",
  },
] as const;

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Email digest settings - schedule (time of day + days) and content
 * sections. Saved explicitly; the hourly server sweep delivers in the
 * member's local timezone (captured on save).
 */
export default function MailSettingsPage() {
  const saved = useQuery(api.emailDigests.getSettings);
  const save = useMutation(api.emailDigests.saveSettings);
  const sendTest = useMutation(api.emailDigests.sendTest);
  // Server settings until the first local edit, then the local draft.
  const [edits, setEdits] = useState<Settings | null>(null);
  const draft = edits ?? saved ?? null;
  const [saving, setSaving] = useState(false);

  if (!draft) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setEdits({ ...draft, [key]: value });

  const toggleDay = (day: number) => {
    if (draft.frequency === "weekly") {
      set("days", [day]);
      return;
    }
    set(
      "days",
      draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day].sort()
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ ...draft, tzOffsetMinutes: new Date().getTimezoneOffset() });
      toast.success("Mail settings saved");
    } catch (error) {
      toast.error(
        error instanceof ConvexError
          ? (error.data as string)
          : "Could not save mail settings"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      await sendTest();
      toast.success("Test digest queued - check your inbox in a minute");
    } catch {
      toast.error("Could not queue the test email");
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold">Mail</h1>
          <p className="text-xs text-muted-foreground">
            A digest of your work, delivered to your inbox on your schedule.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleTest}>
          <Send className="size-3.5" />
          Send test
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Email digests</p>
          <p className="text-xs text-muted-foreground">
            Master switch. Empty digests are skipped automatically.
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(enabled) => set("enabled", enabled)}
          aria-label="Email digests"
        />
      </div>

      <div className={cn("flex flex-col gap-6", !draft.enabled && "opacity-50")}>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Time of day</p>
          <div className="flex gap-2">
            {TIMES.map(({ value, label, hint }) => (
              <Pill
                key={value}
                active={draft.timeOfDay === value}
                onClick={() => set("timeOfDay", value)}
              >
                {label}
                <span className="ml-1 opacity-60">{hint}</span>
              </Pill>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Delivered in your local timezone.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Days</p>
          <div className="flex gap-2">
            {FREQUENCIES.map(({ value, label }) => (
              <Pill
                key={value}
                active={draft.frequency === value}
                onClick={() => {
                  set("frequency", value);
                  if (value === "weekly" && draft.days.length !== 1) {
                    set("days", [draft.days[0] ?? 1]);
                  }
                }}
              >
                {label}
              </Pill>
            ))}
          </div>
          {draft.frequency !== "daily" && (
            <div className="mt-1 flex gap-1.5">
              {WEEKDAYS.map((label, day) => (
                <Pill
                  key={day}
                  active={draft.days.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  {label}
                </Pill>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {draft.frequency === "daily" && "One digest every day."}
            {draft.frequency === "weekly" && "One digest a week, on the day you pick."}
            {draft.frequency === "custom" && "One digest on each selected day."}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium">What&apos;s inside</p>
          {SECTIONS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={draft.sections[key]}
                onCheckedChange={(on) =>
                  set("sections", { ...draft.sections, [key]: on })
                }
                aria-label={label}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Save settings
        </Button>
      </div>
    </>
  );
}
