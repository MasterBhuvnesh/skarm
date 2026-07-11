"use client";

import { OrganizationSwitcher, UserButton, useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
  Bell,
  Bot,
  Box,
  ChevronDown,
  FolderKanban,
  PanelLeft,
  PanelLeftClose,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  SquarePen,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
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
  collapsed = false,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  exact?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  const link = (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        collapsed ? "justify-center" : "gap-2 px-2",
        active && "bg-accent text-foreground"
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{children}</span>}
    </Link>
  );
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{children}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

export function AppSidebar() {
  const params = useParams<{ orgSlug: string }>();
  const { organization } = useOrganization();
  const teams = useQuery(api.teams.list);
  const unreadCount = useQuery(api.notifications.unreadCount) ?? 0;
  const { openCreateIssue, openPalette } = useCommands();
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const base = `/${params.orgSlug}`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex gap-2 p-3",
          collapsed ? "flex-col items-center" : "items-center justify-between"
        )}
      >
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="min-w-0 flex-1">
                <OrganizationSwitcher
                  hidePersonal
                  afterSelectOrganizationUrl="/:slug"
                  afterCreateOrganizationUrl="/:slug"
                  appearance={{
                    elements: {
                      rootBox: "min-w-0 w-full",
                      organizationSwitcherTrigger: "min-w-0 max-w-full",
                      organizationPreview: "min-w-0",
                      organizationPreviewTextContainer: "min-w-0",
                      organizationPreviewMainIdentifier: "block max-w-[11ch] truncate mr-2",
                    },
                  }}
                />
              </div>
            </TooltipTrigger>
            {organization?.name ? (
              <TooltipContent side="bottom">{organization.name}</TooltipContent>
            ) : null}
          </Tooltip>
        )}
        <div className={cn("flex shrink-0 gap-1", collapsed && "flex-col ml-2" )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <PanelLeft className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"} (⌘B)
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        className={cn(
          "flex pb-2",
          collapsed ? "flex-col items-center gap-1" : "flex-col gap-1.5 px-3"
        )}
      >
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={openCreateIssue}
                  aria-label="Create issue"
                >
                  <SquarePen className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Create issue (C)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={openPalette}
                  aria-label="Search"
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (⌘K)</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <button
              onClick={openCreateIssue}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <SquarePen className="size-4" />
              Create issue
              <kbd className="ml-auto rounded border bg-muted px-1 font-mono text-[10px]">
                C
              </kbd>
            </button>
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
          </>
        )}
      </div>

      <ScrollArea className={cn("flex-1", collapsed ? "px-2" : "px-3")}>
        <nav className="flex flex-col gap-0.5 pb-2">
          <NavLink href={base} exact collapsed={collapsed} icon={<Box className="size-4" />}>
            Workspace
          </NavLink>
          <NavLink
            href={`${base}/projects`}
            collapsed={collapsed}
            icon={<FolderKanban className="size-4" />}
          >
            Projects
          </NavLink>
          <NavLink
            href={`${base}/cycles`}
            collapsed={collapsed}
            icon={<RefreshCcw className="size-4" />}
          >
            Cycles
          </NavLink>
          <NavLink
            href={`${base}/graph`}
            collapsed={collapsed}
            icon={<Waypoints className="size-4" />}
          >
            Graph
          </NavLink>
          <NavLink href={`${base}/ai`} collapsed={collapsed} icon={<Bot className="size-4" />}>
            AI Agent
          </NavLink>
        </nav>

        {collapsed ? (
          <div className="flex flex-col gap-0.5 pb-4 pt-1">
            {teams?.map((team) => (
              <NavLink
                key={team._id}
                href={`${base}/team/${team._id}`}
                collapsed
                icon={
                  <span className="flex size-4 items-center justify-center rounded bg-primary/15 text-[9px] font-semibold text-primary">
                    {team.key.slice(0, 2)}
                  </span>
                }
              >
                {team.name}
              </NavLink>
            ))}
          </div>
        ) : (
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
        )}
      </ScrollArea>

      <div
        className={cn(
          "flex border-t p-3",
          collapsed
            ? "flex-col items-center gap-2"
            : "items-center justify-between"
        )}
      >
        <UserButton />
        <div className={cn("flex gap-1", collapsed && "flex-col items-center")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="relative size-7"
                aria-label={
                  unreadCount > 0 ? `Inbox (${unreadCount} unread)` : "Inbox"
                }
              >
                <Link href={`${base}/inbox`}>
                  <Bell className="size-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-primary-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Inbox</TooltipContent>
          </Tooltip>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Settings"
          >
            <Link href={`${base}/settings`}>
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
