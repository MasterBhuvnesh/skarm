import { LucideIcon } from "lucide-react";
import { projectCycleCommands } from "@/components/projects/commands";

/**
 * Command palette + keyboard shortcut registry.
 *
 * PARALLEL-TRACK REGISTRY FILE: tracks may append entries here (one-line
 * additions only - define your command objects in your own files and import
 * them). Do not modify existing entries.
 */
export type AppCommand = {
  id: string;
  label: string;
  /** Group heading in the palette, e.g. "Navigation", "Issues", "AI" */
  group: string;
  icon?: LucideIcon;
  /** Single-key shortcut (no modifier), e.g. "c" for create issue */
  shortcut?: string;
  /**
   * What the command does. Receives router-ish helpers from the palette so
   * commands stay plain objects.
   */
  run: (helpers: CommandHelpers) => void;
};

export type CommandHelpers = {
  push: (path: string) => void;
  orgSlug: string;
  openCreateIssue: () => void;
  toggleTheme: () => void;
};

const builtinCommands: AppCommand[] = [
  {
    id: "create-issue",
    label: "Create new issue",
    group: "Issues",
    shortcut: "c",
    run: ({ openCreateIssue }) => openCreateIssue(),
  },
  {
    id: "go-home",
    label: "Go to workspace home",
    group: "Navigation",
    run: ({ push, orgSlug }) => push(`/${orgSlug}`),
  },
  {
    id: "toggle-theme",
    label: "Toggle light/dark theme",
    group: "Preferences",
    run: ({ toggleTheme }) => toggleTheme(),
  },
];

// ── Track registrations (append imports + spread below) ──────────────────
// Example: import { boardCommands } from "@/components/board/commands";
import { boardViewCommands } from "@/components/board/commands";
import { billingCommands } from "@/components/billing/commands";
import { aiCommands } from "@/components/ai/commands";

export const appCommands: AppCommand[] = [
  ...builtinCommands,
  // ...boardCommands,
  ...boardViewCommands,
  ...projectCycleCommands,
  ...billingCommands,
  ...aiCommands,
];
