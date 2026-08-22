"use client";

import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { PlanLimitListener } from "@/components/billing/upgrade-prompt";
import { CommandProvider } from "@/components/commands/command-provider";
import { AppSidebar } from "./app-sidebar";

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

/**
 * Authenticated workspace shell.
 *
 * 1. Makes sure the Clerk active org matches the org slug in the URL.
 * 2. Waits for the Clerk → Convex webhook sync (user + org docs) before
 *    rendering, so org-scoped queries never throw during onboarding.
 */
export function WorkspaceShell({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const { isLoaded: orgLoaded, organization } = useOrganization();

  // The active organization is the authority on its own slug. Clerk's
  // membership list is a separately cached resource that can still be
  // carrying the slug an organization had before it was renamed, so it must
  // never be what decides the URL is wrong: the chooser sends the user to
  // the active org's fresh slug, this component failed to find that slug in
  // the stale list and sent them back, and the two bounced forever (#28).
  const activeMatches = organization?.slug === orgSlug;

  const targetMembership = userMemberships.data?.find(
    (m) => m.organization.slug === orgSlug
  );
  // Depend on the id, not the membership object: `.find()` returns a fresh
  // object every render and Clerk hands back a new `data` array on every
  // revalidation, so the object identity is not a safe dependency.
  const targetOrgId = targetMembership?.organization.id;
  const needsSwitch = !activeMatches && targetOrgId !== undefined;

  useEffect(() => {
    if (!isLoaded || !orgLoaded) {
      return;
    }
    // Already in the right workspace. Nothing to switch, nowhere to send them.
    if (activeMatches) {
      return;
    }
    if (targetOrgId) {
      // Only when it actually differs. setActive mints a new session token,
      // which revalidates userMemberships and re-runs this effect; calling it
      // for the org that is already active made that a loop, and because each
      // new token makes Convex re-authenticate, every useQuery below was reset
      // to undefined before it could resolve.
      if (organization?.id !== targetOrgId) {
        void setActive({ organization: targetOrgId });
      }
      return;
    }
    if (!userMemberships.isLoading && !userMemberships.hasNextPage) {
      // The user doesn't belong to an org with this slug. Safe to bounce now:
      // the chooser will send them to the active org's current slug, which
      // `activeMatches` accepts on arrival, so this settles in one hop.
      router.replace("/onboarding");
    }
  }, [
    isLoaded,
    orgLoaded,
    activeMatches,
    organization?.id,
    targetOrgId,
    userMemberships.isLoading,
    userMemberships.hasNextPage,
    setActive,
    router,
  ]);

  const currentUser = useQuery(api.users.current);
  const currentOrg = useQuery(api.organizations.current);

  if (!isLoaded || (needsSwitch && currentOrg === undefined)) {
    return <FullScreenLoader label="Loading workspace…" />;
  }

  // Webhook sync still in flight - Convex queries are reactive, so this
  // resolves by itself within a second or two of first sign-up.
  if (currentUser === null || currentOrg === null) {
    return <FullScreenLoader label="Setting up your workspace…" />;
  }

  if (currentUser === undefined || currentOrg === undefined) {
    return <FullScreenLoader label="Loading workspace…" />;
  }

  // Compared by id, not slug. Convex learns about a rename from a webhook, so
  // its copy of the slug briefly lags the one in the URL, and comparing slugs
  // here stranded a freshly renamed workspace on this loader.
  if (organization && currentOrg.clerkOrgId !== organization.id) {
    return <FullScreenLoader label="Switching organization…" />;
  }

  return (
    <CommandProvider>
      {/* Global upgrade prompt: catches free-plan limit errors toasted anywhere in the workspace. */}
      <PlanLimitListener />
      <div className="flex h-dvh overflow-hidden">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </CommandProvider>
  );
}
