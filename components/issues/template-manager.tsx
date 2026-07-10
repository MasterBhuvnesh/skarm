"use client";

import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IssuePriority, PRIORITIES } from "@/components/shared/issue-meta";
import { LabelChip } from "@/components/shared/label-chip";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { cn } from "@/lib/utils";

type Template = Doc<"issueTemplates">;
type Cadence = NonNullable<Template["cadence"]>;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function cadenceSummary(template: Template): string | null {
  switch (template.cadence) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Every weekday";
    case "weekly":
      return `Weekly on ${WEEKDAYS[template.weekday ?? 1]}`;
    case "monthly":
      return `Monthly on day ${template.dayOfMonth ?? 1}`;
    default:
      return null;
  }
}

function formatNextRun(nextRunAt: number): string {
  return new Date(nextRunAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Draft = {
  name: string;
  teamId?: Id<"teams">;
  titlePrefix: string;
  description: string;
  priority: IssuePriority;
  labelIds: Id<"labels">[];
  scheduleEnabled: boolean;
  cadence: Cadence;
  weekday: number;
  dayOfMonth: number;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  titlePrefix: "",
  description: "",
  priority: "none",
  labelIds: [],
  scheduleEnabled: false,
  cadence: "weekly",
  weekday: 1,
  dayOfMonth: 1,
};

function draftFromTemplate(template: Template): Draft {
  return {
    name: template.name,
    teamId: template.teamId,
    titlePrefix: template.titlePrefix,
    description: template.description ?? "",
    priority: template.priority,
    labelIds: template.labelIds,
    scheduleEnabled: template.nextRunAt !== undefined,
    cadence: template.cadence ?? "weekly",
    weekday: template.weekday ?? 1,
    dayOfMonth: template.dayOfMonth ?? 1,
  };
}

/**
 * Workspace settings page for issue templates: CRUD plus a recurring
 * schedule (cadence + on/off) per template.
 */
export function TemplateManager() {
  const templates = useQuery(api.issueTemplates.list, {});
  const teams = useQuery(api.teams.list, {});
  const labels = useQuery(api.labels.list, {});
  const createTemplate = useMutation(api.issueTemplates.create);
  const updateTemplate = useMutation(api.issueTemplates.update);
  const removeTemplate = useMutation(api.issueTemplates.remove);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"issueTemplates"> | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const teamKey = (teamId: Id<"teams">) =>
    teams?.find((t) => t._id === teamId)?.key ?? "?";

  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, teamId: teams?.[0]?._id });
    setEditorOpen(true);
  };

  const openEdit = (template: Template) => {
    setEditingId(template._id);
    setDraft(draftFromTemplate(template));
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!draft.teamId || !draft.name.trim() || !draft.titlePrefix.trim()) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        teamId: draft.teamId,
        name: draft.name,
        titlePrefix: draft.titlePrefix,
        description: draft.description.trim() || undefined,
        priority: draft.priority,
        labelIds: draft.labelIds,
        scheduleEnabled: draft.scheduleEnabled,
        cadence: draft.cadence,
        weekday: draft.cadence === "weekly" ? draft.weekday : undefined,
        dayOfMonth: draft.cadence === "monthly" ? draft.dayOfMonth : undefined,
      };
      if (editingId) {
        await updateTemplate({ templateId: editingId, ...payload });
      } else {
        await createTemplate(payload);
      }
      toast.success(editingId ? "Template updated" : "Template created");
      setEditorOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save template"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: Id<"issueTemplates">) => {
    try {
      await removeTemplate({ templateId });
      toast.success("Template deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete template"
      );
    }
  };

  const toggleLabel = (labelId: Id<"labels">) => {
    setDraft((d) => ({
      ...d,
      labelIds: d.labelIds.includes(labelId)
        ? d.labelIds.filter((id) => id !== labelId)
        : [...d.labelIds, labelId],
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Issue templates</h1>
          <p className="text-sm text-muted-foreground">
            Standardize bug reports and rituals. Recurring templates create an
            issue in the team&apos;s backlog automatically.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus />
          New template
        </Button>
      </div>

      <div className="flex flex-col divide-y rounded-md border">
        {templates === undefined ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : templates.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            No templates yet. Create one to prefill new issues.
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template._id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <PriorityIcon priority={template.priority} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{template.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {teamKey(template.teamId)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {cadenceSummary(template) ? (
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="size-3" />
                      {cadenceSummary(template)}
                      {template.nextRunAt !== undefined
                        ? ` · next ${formatNextRun(template.nextRunAt)}`
                        : " · paused"}
                    </span>
                  ) : (
                    <span className="truncate">{template.titlePrefix}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(template)}
                >
                  <Pencil />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <Trash2 />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete “{template.name}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Issues already created from this template are kept. Any
                        recurring schedule stops.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void handleDelete(template._id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-muted-foreground">
              {editingId ? "Edit template" : "New template"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  placeholder="Bug report"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Team</Label>
                <Select
                  value={draft.teamId ?? ""}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, teamId: value as Id<"teams"> }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map((team) => (
                      <SelectItem key={team._id} value={team._id}>
                        {team.key} · {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-title">Issue title</Label>
              <Input
                id="template-title"
                placeholder="Bug: "
                value={draft.titlePrefix}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, titlePrefix: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-description">
                Description (markdown)
              </Label>
              <Textarea
                id="template-description"
                placeholder={"## Steps to reproduce\n\n## Expected behavior"}
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                className="min-h-24"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={draft.priority}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, priority: value as IssuePriority }))
                }
              >
                <SelectTrigger size="sm" className="w-auto gap-1.5">
                  <PriorityIcon priority={draft.priority} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {labels?.map((label) => {
                const active = draft.labelIds.includes(label._id);
                return (
                  <button
                    key={label._id}
                    type="button"
                    onClick={() => toggleLabel(label._id)}
                    className="rounded-full"
                  >
                    <LabelChip
                      name={label.name}
                      color={label.color}
                      className={cn(
                        "cursor-pointer",
                        active && "border-primary text-foreground"
                      )}
                    />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Recurring</div>
                  <p className="text-xs text-muted-foreground">
                    Automatically create this issue on a schedule (9:00 UTC).
                  </p>
                </div>
                <Switch
                  checked={draft.scheduleEnabled}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({ ...d, scheduleEnabled: checked }))
                  }
                />
              </div>
              {draft.scheduleEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={draft.cadence}
                    onValueChange={(value) =>
                      setDraft((d) => ({ ...d, cadence: value as Cadence }))
                    }
                  >
                    <SelectTrigger size="sm" className="w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draft.cadence === "weekly" ? (
                    <Select
                      value={String(draft.weekday)}
                      onValueChange={(value) =>
                        setDraft((d) => ({ ...d, weekday: Number(value) }))
                      }
                    >
                      <SelectTrigger size="sm" className="w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day, index) => (
                          <SelectItem key={day} value={String(index)}>
                            on {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {draft.cadence === "monthly" ? (
                    <Select
                      value={String(draft.dayOfMonth)}
                      onValueChange={(value) =>
                        setDraft((d) => ({ ...d, dayOfMonth: Number(value) }))
                      }
                    >
                      <SelectTrigger size="sm" className="w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(
                          (day) => (
                            <SelectItem key={day} value={String(day)}>
                              on day {day}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                !draft.name.trim() ||
                !draft.titlePrefix.trim() ||
                !draft.teamId ||
                saving
              }
              onClick={() => void handleSave()}
            >
              {editingId ? "Save template" : "Create template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
