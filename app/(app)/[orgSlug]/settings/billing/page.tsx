"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CurrentPlanCard } from "@/components/billing/current-plan-card";
import { SeatManager } from "@/components/billing/seat-manager";
import { UpgradeOptions } from "@/components/billing/upgrade-options";
import { UsageCard } from "@/components/billing/usage-card";

/**
 * Org billing settings: current-plan summary with Clerk's subscription
 * drawer, live usage against free-tier limits, and upgrade paths.
 */
export default function BillingSettingsPage() {
  const org = useQuery(api.organizations.current);

  if (org === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (org === null) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        Workspace not found.
      </p>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-base font-semibold">Billing</h1>
        <p className="text-xs text-muted-foreground">
          Manage the plan and subscription for this workspace.
        </p>
      </div>
      <CurrentPlanCard org={org} />
      <SeatManager org={org} />
      <UsageCard org={org} />
      <UpgradeOptions org={org} />
    </>
  );
}
