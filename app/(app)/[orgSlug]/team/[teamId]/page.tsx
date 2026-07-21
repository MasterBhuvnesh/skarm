"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { Columns3, List, Loader2, Plus, Search, SearchX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommands } from "@/components/commands/command-provider";
import { IssueRow } from "@/components/issues/issue-row";
import { STATUSES } from "@/components/shared/issue-meta";
import { StatusIcon } from "@/components/shared/status-icon";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { matchSnippet } from "@/lib/utils";

/**
 * Team issues list - the foundation vertical slice. Track A adds the board
 * view, filtering, and saved views on top of this route's sibling pages.
 */
export default function TeamIssuesPage() {
  const params = useParams<{ orgSlug: string; teamId: string }>();
  const router = useRouter();
  const teamId = params.teamId as Id<"teams">;
  const team = useQuery(api.teams.get, { teamId });
  const {
    results: issues,
    status: loadStatus,
    loadMore,
  } = usePaginatedQuery(
    api.issues.listByTeamPaginated,
    { teamId },
    { initialNumItems: 100 }
  );
  const { openCreateIssue } = useCommands();

  // Full-text search over title AND description (search.issues merges the
  // search_title / search_description indexes, scoped to this team).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searchResults = useQuery(
    api.search.issues,
    debouncedQuery ? { query: debouncedQuery, teamId } : "skip"
  );

  // Auto-load the next page when the bottom sentinel scrolls into view.
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && loadStatus === "CanLoadMore") {
          loadMore(100);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadStatus, loadMore, query]);

  if (team === undefined || loadStatus === "LoadingFirstPage") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (team === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Team not found.
      </div>
    );
  }

  const grouped = STATUSES.map((status) => ({
    status,
    issues: issues
      .filter((issue) => issue.status === status.value)
      .sort((a, b) => b.sortOrder - a.sortOrder),
  })).filter((group) => group.issues.length > 0);

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{team.name}</span>
          <span className="text-muted-foreground">Issues</span>
        </div>
        <div className="flex items-center gap-2">
          <InputGroup className="h-7 w-56">
            <InputGroupAddon>
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search title or description…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          <Tabs
            value="list"
            onValueChange={(value) => {
              if (value === "board") {
                router.push(`/${params.orgSlug}/team/${teamId}/board`);
              }
            }}
          >
            <TabsList className="h-7">
              <TabsTrigger value="board" className="h-6 gap-1 px-2 text-xs">
                <Columns3 className="size-3.5" />
                Board
              </TabsTrigger>
              <TabsTrigger value="list" className="h-6 gap-1 px-2 text-xs">
                <List className="size-3.5" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={openCreateIssue}>
            <Plus className="size-4" />
            New issue
          </Button>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {query.trim() ? (
          searchResults === undefined || query.trim() !== debouncedQuery ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-32 text-center">
              <SearchX className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No issues match “{debouncedQuery}”.
              </p>
            </div>
          ) : (
            searchResults.map((issue) => (
              <IssueRow
                key={issue._id}
                issue={issue}
                teamKey={team.key}
                descriptionSnippet={matchSnippet(issue, debouncedQuery)}
              />
            ))
          )
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-32 text-center">
            <p className="text-sm text-muted-foreground">
              No issues yet. Press <kbd className="rounded border bg-muted px-1 font-mono text-xs">C</kbd> to create one.
            </p>
          </div>
        ) : (
          <>
            {grouped.map(({ status, issues: groupIssues }) => (
              <section key={status.value}>
                <div className="flex h-9 items-center gap-2 bg-muted/50 px-4 text-sm">
                  <StatusIcon status={status.value} />
                  <span className="font-medium">{status.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {groupIssues.length}
                  </span>
                </div>
                {groupIssues.map((issue) => (
                  <IssueRow key={issue._id} issue={issue} teamKey={team.key} />
                ))}
              </section>
            ))}
            {loadStatus === "LoadingMore" ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Loading more…
                </span>
              </div>
            ) : null}
            <div ref={loadMoreRef} className="h-1" />
          </>
        )}
      </ScrollArea>
    </>
  );
}
