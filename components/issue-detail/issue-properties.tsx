"use client";

import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  inputDateToMs,
  msToInputDate,
} from "@/components/projects/dates";
import {
  IssuePriority,
  IssueStatus,
  PRIORITIES,
  STATUSES,
} from "@/components/shared/issue-meta";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";
import { UserAvatar } from "@/components/shared/user-avatar";

const UNASSIGNED = "unassigned";

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

type IssuePatch = {
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: Id<"users"> | null;
  estimate?: number | null;
  dueDate?: number | null;
};

export function IssueProperties({ issue }: { issue: Doc<"issues"> }) {
  const updateIssue = useMutation(api.issues.update);
  const members = useQuery(api.organizations.listMembers);

  const update = (patch: IssuePatch) => {
    updateIssue({ issueId: issue._id, ...patch }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update issue"
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <PropertyRow label="Status">
        <Select
          value={issue.status}
          onValueChange={(value) => update({ status: value as IssueStatus })}
        >
          <SelectTrigger size="sm" className="w-36 gap-1.5 border-none shadow-none">
            <StatusIcon status={issue.status} />
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
      </PropertyRow>

      <PropertyRow label="Priority">
        <Select
          value={issue.priority}
          onValueChange={(value) =>
            update({ priority: value as IssuePriority })
          }
        >
          <SelectTrigger size="sm" className="w-36 gap-1.5 border-none shadow-none">
            <PriorityIcon priority={issue.priority} />
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
      </PropertyRow>

      <PropertyRow label="Assignee">
        <Select
          value={issue.assigneeId ?? UNASSIGNED}
          onValueChange={(value) =>
            update({
              assigneeId: value === UNASSIGNED ? null : (value as Id<"users">),
            })
          }
        >
          <SelectTrigger size="sm" className="w-36 gap-1.5 border-none shadow-none">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>
              <span className="text-muted-foreground">Unassigned</span>
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

      <PropertyRow label="Estimate">
        <Select
          value={issue.estimate !== undefined ? String(issue.estimate) : "none"}
          onValueChange={(value) =>
            update({ estimate: value === "none" ? null : Number(value) })
          }
        >
          <SelectTrigger size="sm" className="w-36 gap-1.5 border-none shadow-none">
            <SelectValue placeholder="No estimate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">No estimate</span>
            </SelectItem>
            {[1, 2, 3, 5, 8, 13].map((points) => (
              <SelectItem key={points} value={String(points)}>
                {points} {points === 1 ? "point" : "points"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      <PropertyRow label="Due date">
        <input
          type="date"
          value={issue.dueDate ? msToInputDate(issue.dueDate) : ""}
          onChange={(e) =>
            update({ dueDate: inputDateToMs(e.target.value, "end") ?? null })
          }
          aria-label="Due date"
          className="h-8 rounded-md px-2 text-xs text-foreground outline-none transition-colors hover:bg-accent scheme-light dark:scheme-dark"
        />
      </PropertyRow>
    </div>
  );
}
