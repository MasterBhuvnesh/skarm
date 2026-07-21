"use client";

import { useQuery } from "convex/react";
import { FolderKanban, Loader2, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectRow } from "@/components/projects/project-row";

/** Projects index - Track B. Org-level projects with progress at a glance. */
export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const projects = useQuery(api.projects.listWithProgress);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // The command palette deep-links here with ?new=true to open the dialog,
  // so the URL param is treated as a second "open" source of truth.
  const wantNew = searchParams.get("new") === "true";
  const [manualOpen, setManualOpen] = useState(false);
  const createOpen = manualOpen || wantNew;

  const handleCreateOpenChange = (open: boolean) => {
    setManualOpen(open);
    if (!open && wantNew) {
      router.replace(pathname);
    }
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Projects</span>
          {projects !== undefined && (
            <span className="text-xs text-muted-foreground">
              {projects.length}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
          <Plus className="size-4" />
          New project
        </Button>
      </header>

      {projects === undefined ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <FolderKanban className="size-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground">
              Projects group issues across teams toward a shared goal.
            </p>
          </div>
          <Button size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="size-4" />
            Create project
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex h-8 items-center gap-3 border-b bg-muted/50 px-4 text-xs text-muted-foreground">
            <span className="flex-1 pl-8">Name</span>
            <span className="hidden w-16 text-right sm:block">Issues</span>
            <span className="hidden w-44 md:block">Progress</span>
            <span className="hidden w-14 text-right lg:block">Target</span>
            <span className="w-5 text-right">Lead</span>
          </div>
          {projects.map((project) => (
            <ProjectRow key={project._id} project={project} />
          ))}
        </ScrollArea>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
      />
    </>
  );
}
