"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  CornerDownRight,
  FolderKanban,
  LayoutTemplate,
  Link2,
  Loader2,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  IssuePriority,
  IssueStatus,
  PRIORITIES,
  STATUSES,
} from "@/components/shared/issue-meta";
import { GithubIcon } from "@/components/shared/github-icon";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";

const NO_PROJECT = "no-project";
const NO_ESTIMATE = "no-estimate";

const RELATION_LABELS: Record<string, string> = {
  blocks: "blocks",
  blocked_by: "blocked by",
  related: "related to",
  duplicate_of: "duplicate of",
};

type DraftRelation = {
  issueId: Id<"issues">;
  identifier: string;
  title: string;
  type: "blocks" | "blocked_by" | "related" | "duplicate_of";
  reason: string;
};

export function CreateIssueDialog({
  open,
  onOpenChange,
  defaultTeamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTeamId?: Id<"teams">;
}) {
  const params = useParams<{ orgSlug?: string }>();
  const router = useRouter();
  const teams = useQuery(api.teams.list, open ? {} : "skip");
  const templates = useQuery(api.issueTemplates.list, open ? {} : "skip");
  const projects = useQuery(api.projects.list, open ? {} : "skip");
  const orgLabels = useQuery(api.labels.list, open ? {} : "skip");
  const createIssue = useMutation(api.issues.create);
  const draftIssue = useAction(api.agent.draft.draftIssue);

  const [selectedTeamId, setSelectedTeamId] = useState<
    Id<"teams"> | undefined
  >(undefined);
  const [templateId, setTemplateId] = useState<Id<"issueTemplates"> | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>("todo");
  const [priority, setPriority] = useState<IssuePriority>("none");
  const [labelIds, setLabelIds] = useState<Id<"labels">[]>([]);
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [syncToGithub, setSyncToGithub] = useState(false);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [subIssues, setSubIssues] = useState<string[]>([]);
  const [keptSubIssues, setKeptSubIssues] = useState<Set<number>>(new Set());
  const [relations, setRelations] = useState<DraftRelation[]>([]);
  const [keptRelations, setKeptRelations] = useState<Set<string>>(new Set());
  const [descPreview, setDescPreview] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fall back to the default/first team without needing an effect.
  const teamId = selectedTeamId ?? defaultTeamId ?? teams?.[0]?._id;
  const teamTemplates = templates?.filter((t) => t.teamId === teamId) ?? [];

  const selectedProject = projects?.find((p) => p._id === projectId);
  const projectRepos = selectedProject?.githubRepos ?? [];
  // The repo actually submitted: explicit choice, or the only repo connected.
  const syncRepo = syncToGithub
    ? (githubRepo ?? (projectRepos.length === 1 ? projectRepos[0] : null))
    : null;

  const applyTemplate = (id: Id<"issueTemplates">) => {
    const template = templates?.find((t) => t._id === id);
    if (!template) {
      return;
    }
    setTemplateId(id);
    setTitle(template.titlePrefix);
    setDescription(template.description ?? "");
    setPriority(template.priority);
    setLabelIds(template.labelIds);
  };

  const resetForm = () => {
    setTemplateId(null);
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority("none");
    setLabelIds([]);
    setProjectId(null);
    setSyncToGithub(false);
    setGithubRepo(null);
    setEstimate(null);
    setSubIssues([]);
    setKeptSubIssues(new Set());
    setRelations([]);
    setKeptRelations(new Set());
    setDescPreview(false);
  };

  const draftWithAi = async () => {
    if (!teamId || !title.trim() || drafting) {
      return;
    }
    setDrafting(true);
    try {
      const draft = await draftIssue({
        idea: title.trim(),
        teamId,
        projectId: projectId ?? undefined,
      });
      if (!draft.ok) {
        toast.error(draft.error);
        return;
      }
      setTitle(draft.title);
      setDescription(draft.description);
      setPriority(draft.priority);
      setEstimate(draft.estimate);
      setLabelIds(draft.labels.map((label) => label.labelId));
      setSubIssues(draft.subIssues);
      setKeptSubIssues(new Set(draft.subIssues.map((_, i) => i)));
      setRelations(draft.relations);
      setKeptRelations(new Set(draft.relations.map((r) => r.issueId)));
      setDescPreview(draft.description.trim().length > 0);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not draft the issue"
      );
    } finally {
      setDrafting(false);
    }
  };

  const handleSubmit = async () => {
    if (!teamId || !title.trim()) {
      return;
    }
    if (syncToGithub && !syncRepo) {
      toast.error("Pick a repository to create the issue on GitHub");
      return;
    }
    setSubmitting(true);
    const chosenSubIssues = subIssues.filter((_, i) => keptSubIssues.has(i));
    const chosenRelations = relations.filter((r) =>
      keptRelations.has(r.issueId)
    );
    try {
      const issueId = await createIssue({
        teamId,
        title,
        description: description.trim() || undefined,
        status,
        priority,
        estimate: estimate ?? undefined,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
        projectId: projectId ?? undefined,
        githubRepo: syncRepo ?? undefined,
        subIssues: chosenSubIssues.length > 0 ? chosenSubIssues : undefined,
        relations:
          chosenRelations.length > 0
            ? chosenRelations.map((r) => ({ issueId: r.issueId, type: r.type }))
            : undefined,
      });
      toast.success(
        chosenSubIssues.length > 0
          ? `Issue created with ${chosenSubIssues.length} sub-issue${chosenSubIssues.length === 1 ? "" : "s"}`
          : syncRepo
            ? "Issue created — syncing to GitHub"
            : "Issue created"
      );
      onOpenChange(false);
      resetForm();
      if (params.orgSlug) {
        router.push(`/${params.orgSlug}/issue/${issueId}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create issue"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-muted-foreground">
            New issue
          </DialogTitle>
        </DialogHeader>
        <div className="-mr-2 flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-2">
          <Input
            autoFocus
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void handleSubmit();
              }
            }}
            className="border-none px-0 text-lg font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {descPreview ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDescPreview(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setDescPreview(false);
                }
              }}
              title="Edit description"
              className="group relative max-h-48 shrink-0 cursor-text overflow-y-auto rounded-md"
            >
              <Streamdown className="text-sm leading-relaxed [&_a]:underline [&_code]:text-xs">
                {description}
              </Streamdown>
              <Pencil className="absolute right-1 top-1 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ) : (
            <Textarea
              placeholder="Add description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="max-h-48 min-h-20 shrink-0 resize-none overflow-y-auto border-none px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={teamId ?? ""}
              onValueChange={(value) => {
                setSelectedTeamId(value as Id<"teams">);
                setTemplateId(null);
              }}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
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
            {teamTemplates.length > 0 ? (
              <Select
                value={templateId ?? "none"}
                onValueChange={(value) => {
                  if (value === "none") {
                    setTemplateId(null);
                  } else {
                    applyTemplate(value as Id<"issueTemplates">);
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-auto gap-1.5">
                  <LayoutTemplate className="size-3.5" />
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {teamTemplates.map((template) => (
                    <SelectItem key={template._id} value={template._id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as IssueStatus)}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <StatusIcon status={status} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as IssuePriority)}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <PriorityIcon priority={priority} />
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
            <Select
              value={estimate !== null ? String(estimate) : NO_ESTIMATE}
              onValueChange={(value) =>
                setEstimate(value === NO_ESTIMATE ? null : Number(value))
              }
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <SelectValue placeholder="Estimate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ESTIMATE}>
                  <span className="text-muted-foreground">No estimate</span>
                </SelectItem>
                {[1, 2, 3, 5, 8, 13].map((points) => (
                  <SelectItem key={points} value={String(points)}>
                    {points} {points === 1 ? "point" : "points"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={projectId ?? NO_PROJECT}
              onValueChange={(value) => {
                setProjectId(
                  value === NO_PROJECT ? null : (value as Id<"projects">)
                );
                setSyncToGithub(false);
                setGithubRepo(null);
              }}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <FolderKanban className="size-3.5" />
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>
                  <span className="text-muted-foreground">No project</span>
                </SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projectRepos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={syncToGithub}
                  onCheckedChange={(checked) => {
                    setSyncToGithub(checked === true);
                    if (checked !== true) {
                      setGithubRepo(null);
                    }
                  }}
                />
                <GithubIcon className="size-3.5" />
                Also create this issue on GitHub
              </label>
              {syncToGithub && projectRepos.length > 1 && (
                <Select
                  value={githubRepo ?? ""}
                  onValueChange={(value) => setGithubRepo(value)}
                >
                  <SelectTrigger
                    size="sm"
                    className="ml-auto w-auto gap-1.5 font-mono text-xs"
                  >
                    <SelectValue placeholder="Pick repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectRepos.map((repo) => (
                      <SelectItem
                        key={repo}
                        value={repo}
                        className="font-mono text-xs"
                      >
                        {repo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {syncToGithub && projectRepos.length === 1 && (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {projectRepos[0]}
                </span>
              )}
            </div>
          )}
          {labelIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {labelIds.map((labelId) => {
                const label = orgLabels?.find((l) => l._id === labelId);
                if (!label) {
                  return null;
                }
                return (
                  <span
                    key={labelId}
                    className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                    <button
                      type="button"
                      aria-label={`Remove label ${label.name}`}
                      onClick={() =>
                        setLabelIds((ids) => ids.filter((id) => id !== labelId))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {subIssues.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-2.5 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Sub-issues · {keptSubIssues.size} kept
              </span>
              {subIssues.map((subIssue, index) => (
                <label
                  key={`${subIssue}-${index}`}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <Checkbox
                    checked={keptSubIssues.has(index)}
                    onCheckedChange={(checked) =>
                      setKeptSubIssues((prev) => {
                        const next = new Set(prev);
                        if (checked === true) {
                          next.add(index);
                        } else {
                          next.delete(index);
                        }
                        return next;
                      })
                    }
                  />
                  <CornerDownRight className="size-3 shrink-0 text-muted-foreground" />
                  <span
                    className={`min-w-0 flex-1 truncate ${keptSubIssues.has(index) ? "" : "text-muted-foreground line-through"}`}
                  >
                    {subIssue}
                  </span>
                </label>
              ))}
            </div>
          )}
          {relations.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-2.5 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Relations · {keptRelations.size} kept
              </span>
              {relations.map((relation) => (
                <label
                  key={relation.issueId}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                  title={relation.reason}
                >
                  <Checkbox
                    checked={keptRelations.has(relation.issueId)}
                    onCheckedChange={(checked) =>
                      setKeptRelations((prev) => {
                        const next = new Set(prev);
                        if (checked === true) {
                          next.add(relation.issueId);
                        } else {
                          next.delete(relation.issueId);
                        }
                        return next;
                      })
                    }
                  />
                  <Link2 className="size-3 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 text-muted-foreground">
                    {RELATION_LABELS[relation.type]}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {relation.identifier}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${keptRelations.has(relation.issueId) ? "" : "line-through opacity-60"}`}
                  >
                    {relation.title}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!title.trim() || !teamId || drafting || submitting}
            onClick={() => void draftWithAi()}
            title="Expand the title into a specced issue with acceptance criteria, labels, sub-issues and relations"
          >
            {drafting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {drafting ? "Drafting…" : "Draft with AI"}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!title.trim() || !teamId || submitting}
              onClick={() => void handleSubmit()}
            >
              Create issue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
