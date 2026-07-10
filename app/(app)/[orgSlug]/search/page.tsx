"use client";

import { useQuery } from "convex/react";
import { Loader2, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn, matchSnippet } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";

const ALL_TEAMS = "all";

/**
 * Workspace-wide full-text issue search (Track A), backed by the
 * search_title / search_description indexes. Reachable via the "/" shortcut
 * and the command palette.
 */
export default function SearchPage() {
  const params = useParams<{ orgSlug: string }>();
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const teams = useQuery(api.teams.list);
  const results = useQuery(
    api.search.issues,
    debouncedQuery
      ? {
          query: debouncedQuery,
          ...(teamFilter !== ALL_TEAMS
            ? { teamId: teamFilter as Id<"teams"> }
            : {}),
        }
      : "skip"
  );

  const searching =
    debouncedQuery.length > 0 && results === undefined;
  const waitingForDebounce =
    query.trim().length > 0 && query.trim() !== debouncedQuery;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <span className="text-sm font-medium">Search</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pt-6 pb-3">
          <InputGroup className="h-9 flex-1">
            <InputGroupAddon>
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              placeholder="Search issues by title or description…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger size="sm" className="w-36 gap-1.5">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
              {teams?.map((team) => (
                <SelectItem key={team._id} value={team._id}>
                  {team.key} · {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-2xl px-4 pb-8">
            {debouncedQuery.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-24 text-center">
                <Search className="size-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Search issues across your workspace.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Tip: press{" "}
                  <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                    /
                  </kbd>{" "}
                  anywhere to get here.
                </p>
              </div>
            ) : searching || waitingForDebounce ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : results && results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-24 text-center">
                <SearchX className="size-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No issues found for “{debouncedQuery}”.
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                <p className="px-1 pb-2 text-xs text-muted-foreground">
                  {results?.length}{" "}
                  {results?.length === 1 ? "result" : "results"}
                </p>
                {results?.map((issue) => {
                  const snippet = matchSnippet(issue, debouncedQuery);
                  return (
                    <Link
                      key={issue._id}
                      href={`/${params.orgSlug}/issue/${issue._id}`}
                      className={cn(
                        "group flex items-center gap-3 border-b px-2 text-sm transition-colors hover:bg-accent/50",
                        snippet ? "py-2" : "h-10"
                      )}
                    >
                      <PriorityIcon priority={issue.priority} />
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                        {issue.teamKey}-{issue.number}
                      </span>
                      <StatusIcon status={issue.status} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {issue.title}
                        </div>
                        {snippet ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {snippet}
                          </div>
                        ) : null}
                      </div>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {issue.teamName}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
