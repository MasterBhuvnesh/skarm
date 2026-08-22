"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BillingPeriod,
  FREE_PLAN_DISPLAY_LIMITS,
  PlanDefinition,
  formatPrice,
  priceForPeriod,
} from "@/lib/plans";

/**
 * Plan details, built from lib/plans.ts rather than Clerk's own drawer.
 *
 * Clerk renders whatever a feature's `name` is in the Dashboard, and those
 * are currently the raw slugs, so the drawer showed a list reading
 * "ai_agent, unlimited_projects, unlimited_seats". It also lists the same
 * six features for Pro and Enterprise, which contradicts what the plans
 * actually sell. This app already writes the copy properly once, in
 * lib/plans.ts, and that is what the pricing page renders (#40).
 */
export function PlanDetailsDialog({
  plan,
  period = "month",
  children,
}: {
  plan: PlanDefinition;
  period?: BillingPeriod;
  children: ReactNode;
}) {
  const price = priceForPeriod(plan, period);
  const isFree = plan.plan === "free";

  const members =
    plan.maxSeats === null
      ? "Unlimited"
      : plan.includedSeats !== undefined && plan.perSeatPrice !== undefined
        ? `${plan.includedSeats} included, up to ${plan.maxSeats}`
        : `Up to ${plan.maxSeats}`;

  const limits: [string, string][] = [
    ["Members", members],
    ["Projects", isFree ? `${FREE_PLAN_DISPLAY_LIMITS.projects}` : "Unlimited"],
    ["Issues", isFree ? `${FREE_PLAN_DISPLAY_LIMITS.issues}` : "Unlimited"],
    ["Teams and cycles", "Unlimited"],
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-baseline justify-between gap-3">
            <span>{plan.name}</span>
            <span className="text-lg font-semibold tracking-tight">
              {formatPrice(price)}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                / month
              </span>
            </span>
          </DialogTitle>
          <DialogDescription>{plan.tagline}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {(plan.priceNote || period === "annual") && (
            <p className="text-xs text-muted-foreground">
              {plan.priceNote}
              {period === "annual" && plan.monthlyPrice > 0 && (
                <> · billed annually, {formatPrice(plan.monthlyPrice)} monthly</>
              )}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium">
              {plan.highlightsLeadIn ?? "What's included"}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {plan.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2 text-xs">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border p-3">
            <h3 className="text-xs font-medium">Limits</h3>
            {limits.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{value}</span>
              </div>
            ))}
          </div>

          <Link
            href="/pricing"
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Compare all plans
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
