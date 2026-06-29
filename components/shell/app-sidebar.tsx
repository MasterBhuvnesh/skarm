"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
  Bot,
  Box,
  ChevronDown,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCommands } from "@/components/commands/command-provider";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

function NavLink({
  href,
  icon,
  children,
  exact = false,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground"
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function AppSidebar() {
  const params = useParams<{ orgSlug: string }>();
  const teams = useQuery(api.teams.list);
  const { openCreateIssue, openPalette } = useCommands();
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const base = `/${params.orgSlug}`;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between gap-2 p-3">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/:slug"
          afterCreateOrganizationUrl="/:slug"
          appearance={{
            elements: {
              rootBox: "min-w-0",
              organizationSwitcherTrigger: "max-w-44",
            },
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={openCreateIssue}
              aria-label="New issue"
            >
              <SquarePen className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New issue (C)</TooltipContent>
        </Tooltip>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={openPalette}
          className="flex h-7 w-full items-center gap-2 rounded-md border bg-background px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="size-3.5" />
          Search…
          <kbd className="ml-auto rounded border bg-muted px-1 font-mono text-[10px]">
            ⌘ K
          </kbd>
        </button>
      </div>

      <ScrollArea className="flex-1 px-3">
        <nav className="flex flex-col gap-0.5 pb-2">
          <NavLink href={base} exact icon={<Box className="size-4" />}>
            Workspace
          </NavLink>
          {/* Track B adds /projects + /cycles nav; Track D adds /ai nav */}
          <NavLink href={`${base}/projects`} icon={<Box className="size-4" />}>
            Projects
          </NavLink>
          <NavLink
            href={`${base}/cycles`}
            icon={<RefreshCcw className="size-4" />}
          >
            Cycles
          </NavLink>
          <NavLink href={`${base}/ai`} icon={<Bot className="size-4" />}>
            AI Agent
          </NavLink>
        </nav>

        <Collapsible defaultOpen className="pb-4">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              Your teams
              <ChevronDown className="size-3" />
            </CollapsibleTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() => setCreateTeamOpen(true)}
              aria-label="Create team"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          <CollapsibleContent className="flex flex-col gap-0.5 pt-1">
            {teams?.map((team) => (
              <NavLink
                key={team._id}
                href={`${base}/team/${team._id}`}
                icon={
                  <span className="flex size-4 items-center justify-center rounded bg-primary/15 text-[9px] font-semibold text-primary">
                    {team.key.slice(0, 2)}
                  </span>
                }
              >
                {team.name}
              </NavLink>
            ))}
            {teams?.length === 0 && (
              <button
                onClick={() => setCreateTeamOpen(true)}
                className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-4" />
                Create your first team
              </button>
            )}
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>

      <div className="flex items-center justify-between border-t p-3">
        <UserButton />
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Settings"
          >
            <Link href={`/${params.orgSlug}/settings`}>
              <Settings className="size-4" />
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <CreateTeamDialog open={createTeamOpen} onOpenChange={setCreateTeamOpen} />
    </aside>
  );
}
