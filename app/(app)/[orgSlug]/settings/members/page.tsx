"use client";

import { MembersManager } from "@/components/billing/members-manager";

/**
 * Members settings: list, invite (via Clerk), change roles, and remove
 * members - with plan seat caps surfaced inline. The plan-limit upgrade
 * prompt is mounted globally in WorkspaceShell.
 */
export default function MembersSettingsPage() {
  return <MembersManager />;
}
