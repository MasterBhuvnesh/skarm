"use client";

import { useOrganization } from "@clerk/nextjs";
import { CheckoutButton, useSubscription } from "@clerk/nextjs/experimental";
import { Loader2, Minus, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { formatPrice, planForOrg } from "@/lib/plans";

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
 * Buy additional member seats on a seat-based plan.
 *
 * Clerk owns the payment: `<CheckoutButton seatsQuantity>` opens its own
 * checkout drawer, which prices the change and prorates it for the part of
 * the billing period already elapsed. Nothing here touches payment details.
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

  // Flat-rate plans have nothing to buy: Free is capped and Enterprise is
  // unlimited, so neither has a seat to add.
  const seatBased = plan.perSeatPrice !== undefined && plan.maxSeats !== null;

  const [target, setTarget] = useState<number | null>(null);

  if (!seatBased || !isLoaded || !organization) {
    return null;
  }
  if (membership?.role !== "org:admin") {
    return null;
  }
  if (isLoading || purchasedSeats === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading seats...
      </div>
    );
  }

  const used =
    (memberships?.count ?? organization.membersCount) +
    (invitations?.count ?? organization.pendingInvitationsCount);
  const maxSeats = plan.maxSeats as number;
  const atPlanCeiling = purchasedSeats >= maxSeats;

  // Default the picker one seat above what is already paid for.
  const desired = target ?? Math.min(purchasedSeats + 1, maxSeats);
  const addedSeats = Math.max(0, desired - purchasedSeats);
  const included = plan.includedSeats ?? 0;
  const billableSeats = Math.max(0, desired - included);
  const newMonthlyTotal =
    plan.monthlyPrice + billableSeats * (plan.perSeatPrice as number);

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <UsersRound className="size-4 text-primary" />
          </span>
          <div>
            <h2 className="text-sm font-medium">Seats</h2>
            <p className="text-xs text-muted-foreground">
              {used} of {purchasedSeats} used
              {purchasedSeats < maxSeats
                ? ` · up to ${maxSeats} on ${plan.name}`
                : ` · ${plan.name} maximum`}
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {included} included, then {formatPrice(plan.perSeatPrice as number)}
          /member
        </span>
      </div>

      {atPlanCeiling ? (
        <p className="text-xs text-muted-foreground">
          All {maxSeats} seats on {plan.name} are purchased. Upgrade to
          Enterprise for unlimited members.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Remove a seat"
                disabled={desired <= purchasedSeats + 1}
                onClick={() => setTarget(desired - 1)}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="min-w-8 text-center text-sm font-medium tabular-nums">
                {desired}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Add a seat"
                disabled={desired >= maxSeats}
                onClick={() => setTarget(desired + 1)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              total seats · adding {addedSeats}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              New total {formatPrice(newMonthlyTotal)}/month. Clerk confirms
              the exact amount, prorated for the rest of this period.
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
                  `Seats updated. You can now invite up to ${desired} members.`
                );
              }}
            >
              <Button size="sm">
                Buy {addedSeats} {addedSeats === 1 ? "seat" : "seats"}
              </Button>
            </CheckoutButton>
          </div>
        </>
      )}
    </div>
  );
}
