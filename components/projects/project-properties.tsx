"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { GithubIcon } from "@/components/shared/github-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import { inputDateToMs, msToInputDate } from "./dates";
import { PROJECT_COLORS, PROJECT_STATUSES, ProjectStatus } from "./project-meta";
import { ProjectStatusIcon } from "./project-status-icon";

const NO_LEAD = "no-lead";

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

type ProjectPatch = {
  status?: ProjectStatus;
  leadId?: Id<"users"> | null;
  targetDate?: number | null;
  color?: string | null;
  githubRepos?: string[];
};

type RepoMeta = {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
};

export function ProjectProperties({ project }: { project: Doc<"projects"> }) {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const members = useQuery(api.organizations.listMembers);
  const integration = useQuery(api.integrations.get);
  const updateProject = useMutation(api.projects.update);
  const removeProject = useMutation(api.projects.remove);
  const listRepositories = useAction(api.github.client.listRepositories);

  // Live repo list from GitHub, fetched lazily when the picker opens.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [available, setAvailable] = useState<RepoMeta[] | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const connectedRepos =
    project.githubRepos ?? (project.githubRepo ? [project.githubRepo] : []);
  const repoMeta = new Map((available ?? []).map((r) => [r.fullName, r]));

  const onPickerOpenChange = (open: boolean) => {
    setPickerOpen(open);
    if (open && available === null && !loadingRepos) {
      setLoadingRepos(true);
      setRepoError(null);
      listRepositories()
        .then(setAvailable)
        .catch((error: unknown) => {
          setRepoError(
            error instanceof Error
              ? error.message
              : "Failed to load repositories"
          );
        })
        .finally(() => setLoadingRepos(false));
    }
  };

  const toggleRepo = (fullName: string) => {
    const next = connectedRepos.includes(fullName)
      ? connectedRepos.filter((repo) => repo !== fullName)
      : [...connectedRepos, fullName];
    update({ githubRepos: next });
  };

  const update = (patch: ProjectPatch) => {
    updateProject({ projectId: project._id, ...patch }).catch(
      (error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to update project"
        );
      }
    );
  };

  const handleDelete = async () => {
    try {
      await removeProject({ projectId: project._id });
      toast.success("Project deleted");
      router.push(`/${params.orgSlug}/projects`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete project"
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <PropertyRow label="Status">
        <Select
          value={project.status}
          onValueChange={(value) => update({ status: value as ProjectStatus })}
        >
          <SelectTrigger
            size="sm"
            className="w-36 gap-1.5 border-none shadow-none"
          >
            <ProjectStatusIcon status={project.status} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      <PropertyRow label="Lead">
        <Select
          value={project.leadId ?? NO_LEAD}
          onValueChange={(value) =>
            update({
              leadId: value === NO_LEAD ? null : (value as Id<"users">),
            })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-36 gap-1.5 border-none shadow-none"
          >
            <SelectValue placeholder="No lead" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_LEAD}>
              <span className="text-muted-foreground">No lead</span>
            </SelectItem>
            {members?.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                <UserAvatar name={member.name} imageUrl={member.imageUrl} />
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      <PropertyRow label="Target date">
        <input
          type="date"
          value={project.targetDate ? msToInputDate(project.targetDate) : ""}
          onChange={(e) =>
            update({ targetDate: inputDateToMs(e.target.value, "end") ?? null })
          }
          aria-label="Target date"
          className="h-8 rounded-md px-2 text-xs text-foreground outline-none transition-colors hover:bg-accent scheme-light dark:scheme-dark"
        />
      </PropertyRow>

      <PropertyRow label="Color">
        <div className="flex items-center gap-1.5 px-2">
          {PROJECT_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Use color ${swatch}`}
              onClick={() => update({ color: swatch })}
              className={cn(
                "size-3.5 rounded-full transition-transform hover:scale-110",
                project.color === swatch &&
                  "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </PropertyRow>

      <Separator className="my-1" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            GitHub repositories
          </span>
          {integration?.connection && (
            <Popover open={pickerOpen} onOpenChange={onPickerOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  aria-label="Connect repositories"
                >
                  <Plus className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-1.5">
                {loadingRepos ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : repoError ? (
                  <p className="p-2 text-xs text-muted-foreground">
                    {repoError}
                  </p>
                ) : (available ?? []).length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">
                    No repositories granted to the GitHub App. Manage access
                    from your GitHub installation settings.
                  </p>
                ) : (
                  <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                    {available?.map((repo) => (
                      <label
                        key={repo.fullName}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                      >
                        <Checkbox
                          checked={connectedRepos.includes(repo.fullName)}
                          onCheckedChange={() => toggleRepo(repo.fullName)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-muted-foreground">
                            {repo.owner}/
                          </span>
                          <span className="font-medium">{repo.name}</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {repo.private ? "Private" : "Public"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        {connectedRepos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {integration === undefined ? (
              "…"
            ) : integration.connection ? (
              "No repositories connected."
            ) : (
              <>
                Connect GitHub in{" "}
                <Link
                  href={`/${params.orgSlug}/settings/integrations`}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Settings → Integrations
                </Link>{" "}
                first.
              </>
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {connectedRepos.map((repo) => {
              const meta = repoMeta.get(repo);
              const [owner, name] = repo.split("/");
              return (
                <div
                  key={repo}
                  className="group flex items-center gap-2 rounded-md border bg-card/50 px-2.5 py-1.5"
                >
                  <GithubIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-medium">{name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {owner}
                    </p>
                  </div>
                  {meta && (
                    <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {meta.private ? "Private" : "Public"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleRepo(repo)}
                    aria-label={`Disconnect ${repo}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {connectedRepos.length > 0 && project.githubRepoConnectedBy && (
          <p className="text-[11px] text-muted-foreground">
            Connected by{" "}
            {members?.find((m) => m.userId === project.githubRepoConnectedBy)
              ?.name ?? "a former member"}
          </p>
        )}
      </div>

      <Separator className="my-1" />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete project
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will be permanently deleted. Its issues are kept and
              simply detached from the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
