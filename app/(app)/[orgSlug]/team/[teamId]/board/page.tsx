"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { Columns3, List, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommands } from "@/components/commands/command-provider";
import { BoardView, ColumnPagination } from "@/components/board/board-view";
import { CardAssignee, CardLabel } from "@/components/board/board-card";
import { IssueStatus } from "@/components/shared/issue-meta";
import { FilterBar } from "@/components/views/filter-bar";
import { FilteredIssueList } from "@/components/views/filtered-issue-list";
import {
  countActiveFilters,
  DisplayMode,
  displayFromSearchParams,
  filtersFromSearchParams,
  IssueFilters,
  issueMatchesFilters,
  toQueryString,
} from "@/components/views/filters";
import { ViewSwitcher } from "@/components/views/view-switcher";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

function CenteredSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

const BOARD_PAGE_SIZE = 50;
const BOARD_PAGE_OPTS = { initialNumItems: BOARD_PAGE_SIZE };

type PaginatedColumn = {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
};

function columnPagination(column: PaginatedColumn): ColumnPagination {
  return {
    canLoadMore: column.status === "CanLoadMore",
    isLoadingMore: column.status === "LoadingMore",
    loadMore: () => column.loadMore(BOARD_PAGE_SIZE),
  };
}

/**
 * Team board route (Track A): Kanban board + filtered list display with
 * URL-encoded filters and saved views. Lives alongside the foundation's
 * issues list at /team/[teamId].
 */
export default function TeamBoardPage() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <TeamBoardContent />
    </Suspense>
  );
}

function TeamBoardContent() {
  const params = useParams<{ orgSlug: string; teamId: string }>();
  const teamId = params.teamId as Id<"teams">;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openCreateIssue } = useCommands();

  const team = useQuery(api.teams.get, { teamId });
  // One paginated subscription per status column. Rules-of-hooks forbids
  // looping hook calls, so the six statuses are spelled out explicitly.
  const backlog = usePaginatedQuery(
    api.issues.listByTeamStatusPaginated,
    { teamId, status: "backlog" },
    BOARD_PAGE_OPTS
  );
  const todo = usePaginatedQuery(
    api.issues.listByTeamStatusPaginated,
    { teamId, status: "todo" },
    BOARD_PAGE_OPTS
  );
  const inProgress = usePaginatedQuery(
    api.issues.listByTeamStatusPaginated,
    { teamId, status: "in_progress" },
    BOARD_PAGE_OPTS
  );
  const inReview = usePaginatedQuery(
    api.issues.listByTeamStatusPaginated,
    { teamId, status: "in_review" },
    BOARD_PAGE_OPTS
  );
  const done = usePaginatedQuery(
    api.issues.listByTeamStatusPaginated,
    { teamId, status: "done" },
    BOARD_PAGE_OPTS
  );
  const canceled = usePaginatedQuery(
    api.issues.listByTeamStatusPaginated,
    { teamId, status: "canceled" },
    BOARD_PAGE_OPTS
  );
  const issues = useMemo(
    () => [
      ...backlog.results,
      ...todo.results,
      ...inProgress.results,
      ...inReview.results,
      ...done.results,
      ...canceled.results,
    ],
    [
      backlog.results,
      todo.results,
      inProgress.results,
      inReview.results,
      done.results,
      canceled.results,
    ]
  );
  const labelRows = useQuery(api.views.teamIssueLabels, { teamId });
  const members = useQuery(api.organizations.listMembers);
  const orgLabels = useQuery(api.labels.list);

  const filters = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams]
  );
  const display = displayFromSearchParams(searchParams);

  // Same full-text search (title AND body) as the issues list, used here to
  // narrow the visible cards by id on top of the client-side filters.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searchResults = useQuery(
    api.search.issues,
    debouncedQuery ? { query: debouncedQuery, teamId } : "skip"
  );
  const searchedIds = useMemo(
    () =>
      debouncedQuery && searchResults
        ? new Set<string>(searchResults.map((issue) => issue._id))
        : null,
    [debouncedQuery, searchResults]
  );

  const applyState = (nextFilters: IssueFilters, nextDisplay: DisplayMode) => {
    const query = toQueryString(nextFilters, nextDisplay);
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const labelsByIssue = useMemo(() => {
    const map = new Map<Id<"issues">, CardLabel[]>();
    for (const row of labelRows ?? []) {
      const list = map.get(row.issueId) ?? [];
      list.push({ labelId: row.labelId, name: row.name, color: row.color });
      map.set(row.issueId, list);
    }
    return map;
  }, [labelRows]);

  const labelIdsByIssue = useMemo(() => {
    const map = new Map<Id<"issues">, Set<string>>();
    for (const [issueId, labels] of labelsByIssue) {
      map.set(issueId, new Set(labels.map((label) => label.labelId)));
    }
    return map;
  }, [labelsByIssue]);

  const assigneesById = useMemo(() => {
    const map = new Map<string, CardAssignee>();
    for (const member of members ?? []) {
      map.set(member.userId, { name: member.name, imageUrl: member.imageUrl });
    }
    return map;
  }, [members]);

  const filteredIssues = useMemo(
    () =>
      (issues ?? []).filter(
        (issue) =>
          issueMatchesFilters(issue, filters, labelIdsByIssue) &&
          (searchedIds === null || searchedIds.has(issue._id))
      ),
    [issues, filters, labelIdsByIssue, searchedIds]
  );

  const loadingFirstPage = [
    backlog,
    todo,
    inProgress,
    inReview,
    done,
    canceled,
  ].some((column) => column.status === "LoadingFirstPage");

  if (team === undefined || loadingFirstPage) {
    return <CenteredSpinner />;
  }

  if (team === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Team not found.
      </div>
    );
  }

  const pagination: Record<IssueStatus, ColumnPagination> = {
    backlog: columnPagination(backlog),
    todo: columnPagination(todo),
    in_progress: columnPagination(inProgress),
    in_review: columnPagination(inReview),
    done: columnPagination(done),
    canceled: columnPagination(canceled),
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            href={`/${params.orgSlug}/team/${teamId}`}
            className="truncate font-medium text-muted-foreground hover:text-foreground"
          >
            {team.name}
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium">
            {display === "board" ? "Board" : "List"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitcher
            orgSlug={params.orgSlug}
            teamId={teamId}
            display={display}
            filters={filters}
          />
          <Tabs
            value={display}
            onValueChange={(value) =>
              applyState(filters, value as DisplayMode)
            }
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

      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <FilterBar
          filters={filters}
          onFiltersChange={(next) => applyState(next, display)}
          members={members ?? []}
          labels={orgLabels ?? []}
        />
        <InputGroup className="h-7 w-56 shrink-0">
          <InputGroupAddon>
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search title or description…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
      </div>

      {display === "board" ? (
        <BoardView
          issues={filteredIssues}
          teamId={teamId}
          teamKey={team.key}
          orgSlug={params.orgSlug}
          labelsByIssue={labelsByIssue}
          assigneesById={assigneesById}
          pagination={pagination}
        />
      ) : (
        <FilteredIssueList
          issues={filteredIssues}
          teamKey={team.key}
          hasActiveFilters={countActiveFilters(filters) > 0 || searchedIds !== null}
        />
      )}
    </>
  );
}
