"use client";

import { useOrganization } from "@clerk/nextjs";
import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, planForOrg } from "@/lib/plans";
import { PlanDetailsDialog } from "./plan-details-dialog";

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" {
  if (status === "active") {
    return "default";
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "destructive";
  }
  return "secondary";
}

/**
 * Current-plan summary for the org billing settings page, with Clerk's
 * subscription drawer behind a custom button for admins.
 */
export function CurrentPlanCard({ org }: { org: Doc<"organizations"> }) {
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const plan = planForOrg(org.plan);
  const isPaid = plan.monthlyPrice > 0;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">Plan</h2>
        <p className="text-xs text-muted-foreground">
          The subscription for the {org.name} workspace.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{plan.name}</span>
              {org.subscriptionStatus && (
                <Badge
                  variant={statusBadgeVariant(org.subscriptionStatus)}
                  className="h-4 rounded-full px-1.5 text-[10px] capitalize"
                >
                  {org.subscriptionStatus.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{plan.tagline}</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tracking-tight">
              {formatPrice(plan.monthlyPrice)}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                / month
              </span>
            </div>
            {plan.priceNote && (
              <p className="text-[11px] text-muted-foreground">
                {plan.priceNote}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t pt-3">
          {isPaid ? (
            isAdmin ? (
              <SubscriptionDetailsButton
                for="organization"
                onSubscriptionCancel={() =>
                  toast.success("Subscription cancelled")
                }
              >
                <Button size="sm">Manage subscription</Button>
              </SubscriptionDetailsButton>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only workspace admins can manage the subscription.
              </p>
            )
          ) : (
            <Button size="sm" asChild>
              <Link href="/pricing">
                Compare plans
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          )}
          <PlanDetailsDialog plan={plan}>
            <Button variant="ghost" size="sm">
              Plan details
            </Button>
          </PlanDetailsDialog>
        </div>
      </div>
    </section>
  );
}
