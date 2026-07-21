"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusIcon } from "@/components/shared/status-icon";

/**
 * "Add issues" picker shared by the project and cycle detail pages. The
 * actual assignment goes through `issues.update` (projectId/cycleId) in the
 * caller - this component only renders candidates and reports selections.
 * Stays open after a pick so several issues can be added in a row; the
 * candidate list shrinks reactively as issues are assigned.
 */
export function AddIssuesPopover({
  candidates,
  teamKeyFor,
  onAdd,
  emptyText = "No issues to add.",
}: {
  candidates: Doc<"issues">[] | undefined;
  teamKeyFor: (teamId: Id<"teams">) => string;
  onAdd: (issueId: Id<"issues">) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          Add issues
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command>
          <CommandInput placeholder="Add existing issues…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {candidates?.map((issue) => {
              const identifier = `${teamKeyFor(issue.teamId)}-${issue.number}`;
              return (
                <CommandItem
                  key={issue._id}
                  value={`${identifier} ${issue.title}`}
                  onSelect={() => onAdd(issue._id)}
                >
                  <StatusIcon status={issue.status} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {identifier}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
