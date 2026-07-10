"use client";

import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  githubRepo?: string | null;
};

export function ProjectProperties({ project }: { project: Doc<"projects"> }) {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const members = useQuery(api.organizations.listMembers);
  const updateProject = useMutation(api.projects.update);
  const removeProject = useMutation(api.projects.remove);

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
          className="h-8 rounded-md px-2 text-xs text-foreground outline-none transition-colors hover:bg-accent [color-scheme:light] dark:[color-scheme:dark]"
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

      <PropertyRow label="GitHub repo">
        <input
          type="text"
          key={project.githubRepo ?? ""}
          defaultValue={project.githubRepo ?? ""}
          placeholder="owner/repo"
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value !== (project.githubRepo ?? "")) {
              update({ githubRepo: value || null });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          aria-label="GitHub repo"
          className="h-8 w-36 rounded-md px-2 text-right font-mono text-xs text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground hover:bg-accent focus:bg-accent"
        />
      </PropertyRow>
      {project.githubRepo && project.githubRepoConnectedBy && (
        <p className="-mt-2 text-right text-[11px] text-muted-foreground">
          Connected by{" "}
          {members?.find((m) => m.userId === project.githubRepoConnectedBy)
            ?.name ?? "a former member"}
        </p>
      )}

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
