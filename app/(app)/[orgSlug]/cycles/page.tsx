"use client";

import { useQuery } from "convex/react";
import { Loader2, Plus, RefreshCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateCycleDialog } from "@/components/cycles/create-cycle-dialog";
import { CycleRow } from "@/components/cycles/cycle-row";

/** Cycles index — Track B. Per-team time-boxed cycles, grouped by team. */
export default function CyclesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CyclesPageInner />
    </Suspense>
  );
}

function CyclesPageInner() {
  const cycles = useQuery(api.cycles.listWithProgress);
  const teams = useQuery(api.teams.list);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // The command palette deep-links here with ?new=true to open the dialog,
  // so the URL param is treated as a second "open" source of truth.
  const wantNew = searchParams.get("new") === "true";
  const [manualOpen, setManualOpen] = useState(false);
  const [createTeamId, setCreateTeamId] = useState<Id<"teams"> | undefined>(
    undefined
  );
  const createOpen = manualOpen || wantNew;

  const openCreate = (teamId?: Id<"teams">) => {
    setCreateTeamId(teamId);
    setManualOpen(true);
  };

  const handleCreateOpenChange = (open: boolean) => {
    setManualOpen(open);
    if (!open) {
      setCreateTeamId(undefined);
      if (wantNew) {
        router.replace(pathname);
      }
    }
  };

  const loading = cycles === undefined || teams === undefined;
  const teamsWithCycles = teams?.filter((team) =>
    cycles?.some((cycle) => cycle.teamId === team._id)
  );

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Cycles</span>
          {cycles !== undefined && (
            <span className="text-xs text-muted-foreground">
              {cycles.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openCreate()}
          disabled={teams !== undefined && teams.length === 0}
        >
          <Plus className="size-4" />
          New cycle
        </Button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : cycles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <RefreshCcw className="size-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">No cycles yet</p>
            <p className="text-xs text-muted-foreground">
              Cycles are time-boxed sprints for a team, numbered automatically.
            </p>
          </div>
          {teams.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Create a team first, then start its first cycle.
            </p>
          ) : (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="size-4" />
              Start a cycle
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {teamsWithCycles?.map((team) => (
            <section key={team._id}>
              <div className="flex h-9 items-center gap-2 bg-muted/50 px-4 text-sm">
                <span className="flex size-4 items-center justify-center rounded bg-primary/15 text-[9px] font-semibold text-primary">
                  {team.key.slice(0, 2)}
                </span>
                <span className="font-medium">{team.name}</span>
                <span className="text-xs text-muted-foreground">
                  {cycles.filter((cycle) => cycle.teamId === team._id).length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-6"
                  onClick={() => openCreate(team._id)}
                  aria-label={`New cycle for ${team.name}`}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              {cycles
                .filter((cycle) => cycle.teamId === team._id)
                .map((cycle) => (
                  <CycleRow key={cycle._id} cycle={cycle} />
                ))}
            </section>
          ))}
        </ScrollArea>
      )}

      <CreateCycleDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        defaultTeamId={createTeamId}
      />
    </>
  );
}
