"use client";

import { useOrganization } from "@clerk/nextjs";
import { CheckoutButton, useSubscription } from "@clerk/nextjs/experimental";
import { Minus, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, planForOrg } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Seats the workspace has actually paid for, or null when its plan is not
 * seat-based (Free and Enterprise are flat rate).
 *
 * This - not `plan.maxSeats` - is the number Clerk enforces. A Pro workspace
 * that has bought 3 seats is refused a 4th invitation with "You have reached
 * your limit of 3 organization memberships", even though the plan permits
 * 10. Clerk blocks rather than billing for the extra member, so the seat has
 * to be purchased first (#29).
 */
export function usePurchasedSeats() {
  const { data, isLoading, revalidate } = useSubscription({
    for: "organization",
  });
  const seatItem = data?.subscriptionItems.find(
    (item) => item.status === "active" && item.seats
  );
  return {
    purchasedSeats: seatItem?.seats?.quantity ?? null,
    planPeriod: seatItem?.planPeriod,
    isLoading,
    revalidate,
  };
}

/**
 * Buy member seats on a seat-based plan.
 *
 * Clerk owns the payment: `<CheckoutButton seatsQuantity>` opens its own
 * checkout drawer, which prices the change and prorates it for the part of
 * the billing period already elapsed. No payment details pass through here.
 *
 * `seatsQuantity` is the TOTAL seat count to end up with, not the number
 * being added.
 */
export function SeatManager({ org }: { org: Doc<"organizations"> }) {
  const plan = planForOrg(org.plan);
  const { isLoaded, organization, membership, memberships, invitations } =
    useOrganization({
      memberships: { infinite: true },
      invitations: { infinite: true },
    });
  const { purchasedSeats, planPeriod, isLoading, revalidate } =
    usePurchasedSeats();
  const [target, setTarget] = useState<number | null>(null);

  const { maxSeats, perSeatPrice, includedSeats } = plan;
  // Nothing to buy on a flat-rate plan: Free is capped and Enterprise is
  // unlimited. Narrowing here also drops both values out of `null`/`undefined`
  // for the rest of the component.
  if (maxSeats === null || perSeatPrice === undefined) {
    return null;
  }
  if (!isLoaded || !organization || membership?.role !== "org:admin") {
    return null;
  }

  if (isLoading) {
    return (
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Seats</h2>
          <Skeleton className="mt-1 h-3 w-64" />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </section>
    );
  }

  // The plan is seat-based here but Clerk reports no seat entitlement, which
  // means its billing config and lib/plans.ts disagree. Showing a purchase
  // control that cannot work would be worse than showing nothing; the members
  // page still reports the limit Clerk is actually applying.
  if (purchasedSeats === null) {
    return null;
  }

  const used =
    (memberships?.count ?? organization.membersCount) +
    (invitations?.count ?? organization.pendingInvitationsCount);
  const included = includedSeats ?? 0;
  const allSeatsBought = purchasedSeats >= maxSeats;
  const ratio = purchasedSeats > 0 ? used / purchasedSeats : 0;

  const desired = target ?? Math.min(purchasedSeats + 1, maxSeats);
  const addedSeats = Math.max(0, desired - purchasedSeats);
  const newMonthlyTotal =
    plan.monthlyPrice + Math.max(0, desired - included) * perSeatPrice;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">Seats</h2>
        <p className="text-xs text-muted-foreground">
          Members you have paid for on {plan.name}. {included} come with the
          plan, then {formatPrice(perSeatPrice)} each, up to {maxSeats}.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Seats in use</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                used >= purchasedSeats && "text-destructive"
              )}
            >
              {used}
              <span className="font-normal text-muted-foreground">
                {" "}
                / {purchasedSeats}
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width]",
                ratio >= 0.8 && "bg-amber-500",
                ratio >= 1 && "bg-destructive"
              )}
              style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
            />
          </div>
        </div>

        {allSeatsBought ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              All {maxSeats} seats on {plan.name} are bought. Upgrade to
              Enterprise for unlimited members.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Total seats</span>
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Remove a seat"
                  disabled={desired <= purchasedSeats + 1}
                  onClick={() => setTarget(desired - 1)}
                >
                  <Minus className="size-3" />
                </Button>
                <span
                  aria-live="polite"
                  className="min-w-7 text-center text-xs font-medium tabular-nums"
                >
                  {desired}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Add a seat"
                  disabled={desired >= maxSeats}
                  onClick={() => setTarget(desired + 1)}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                {formatPrice(newMonthlyTotal)} / month afterwards. Checkout
                shows the exact amount, charged pro rata for the rest of this
                period.
              </p>
              <CheckoutButton
                planId={plan.clerkPlanId}
                planPeriod={planPeriod ?? "month"}
                for="organization"
                seatsQuantity={desired}
                onSubscriptionComplete={() => {
                  setTarget(null);
                  void revalidate();
                  void memberships?.revalidate?.();
                  toast.success(
                    addedSeats === 1
                      ? "Seat added. You can invite one more member."
                      : `${addedSeats} seats added. You can invite ${addedSeats} more members.`
                  );
                }}
              >
                <Button size="sm" className="shrink-0">
                  Buy {addedSeats} {addedSeats === 1 ? "seat" : "seats"}
                </Button>
              </CheckoutButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
