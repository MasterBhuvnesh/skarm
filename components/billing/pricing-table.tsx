"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import {
  CheckoutButton,
  SubscriptionDetailsButton,
} from "@clerk/nextjs/experimental";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BillingPeriod,
  PLANS,
  PlanDefinition,
  formatPrice,
  priceForPeriod,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import { BillingPeriodToggle } from "./billing-period-toggle";
import { PlanDetailsDialog } from "./plan-details-dialog";

/**
 * Hand-built pricing table (no <PricingTable />): three plan cards driven by
 * lib/plans.ts, with Clerk CheckoutButton / SubscriptionDetailsButton behind
 * custom shadcn buttons. Plan details come from our own dialog rather than
 * Clerk's drawer, which renders raw feature slugs (#40).
 */
export function PricingTable() {
  const [period, setPeriod] = useState<BillingPeriod>("month");

  return (
    <div className="flex flex-col items-center gap-8">
      <BillingPeriodToggle period={period} onPeriodChange={setPeriod} />
      <div className="grid w-full gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.slug} plan={plan} period={period} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  period,
}: {
  plan: PlanDefinition;
  period: BillingPeriod;
}) {
  const price = priceForPeriod(plan, period);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-6",
        plan.popular &&
          "border-primary/40 shadow-[0_0_60px_-16px] shadow-primary/25"
      )}
    >
      {plan.popular && (
        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5">
          Most popular
        </Badge>
      )}

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{plan.name}</h3>
        <PlanDetailsDialog plan={plan} period={period}>
          <button className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            Plan details
          </button>
        </PlanDetailsDialog>
      </div>
      <p className="mt-1 min-h-8 text-xs text-muted-foreground">
        {plan.tagline}
      </p>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight">
          {formatPrice(price)}
        </span>
        <span className="text-sm text-muted-foreground">/ month</span>
      </div>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">
        {price > 0 && period === "annual"
          ? `Billed annually${plan.priceNote ? ` · ${plan.priceNote}` : ""}`
          : (plan.priceNote ?? (price === 0 ? "Free forever" : ""))}
      </p>

      <div className="mt-5">
        <PlanCta plan={plan} period={period} />
      </div>

      <ul className="mt-6 flex flex-col gap-2 border-t pt-5">
        {plan.highlightsLeadIn && (
          <li className="text-xs font-medium text-foreground">
            {plan.highlightsLeadIn}
          </li>
        )}
        {plan.highlights.map((highlight) => (
          <li
            key={highlight}
            className="flex items-start gap-2 text-xs text-muted-foreground"
          >
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            {highlight}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Plan call-to-action. Checkout is only possible when signed in with an
 * active organization (Clerk throws otherwise), so the states are:
 * signed out → sign up; no active org → onboarding; member → ask an admin;
 * admin → CheckoutButton / SubscriptionDetailsButton.
 */
function PlanCta({
  plan,
  period,
}: {
  plan: PlanDefinition;
  period: BillingPeriod;
}) {
  const { isLoaded, isSignedIn, has, orgId } = useAuth();
  const { organization, membership } = useOrganization();

  const variant = plan.popular ? "default" : "outline";

  if (!isLoaded) {
    return (
      <Button variant={variant} size="lg" className="w-full" disabled>
        &nbsp;
      </Button>
    );
  }

  if (!isSignedIn) {
    return (
      <Button variant={variant} size="lg" className="w-full" asChild>
        <Link href="/sign-up">
          {plan.monthlyPrice === 0
            ? "Start for free"
            : `Start with ${plan.name}`}
        </Link>
      </Button>
    );
  }

  if (!orgId) {
    return (
      <Button variant={variant} size="lg" className="w-full" asChild>
        <Link href="/onboarding">Choose a workspace</Link>
      </Button>
    );
  }

  const isCurrent = has?.({ plan: plan.slug }) ?? false;
  if (isCurrent) {
    return (
      <Button variant="outline" size="lg" className="w-full" disabled>
        Current plan
      </Button>
    );
  }

  const isAdmin = membership?.role === "org:admin";
  if (!isAdmin) {
    return (
      <Button variant="outline" size="lg" className="w-full" disabled>
        Ask an admin to change plans
      </Button>
    );
  }

  // Moving (back) to Free means cancelling the paid subscription.
  if (plan.monthlyPrice === 0) {
    return (
      <SubscriptionDetailsButton
        for="organization"
        onSubscriptionCancel={() => toast.success("Subscription cancelled")}
      >
        <Button variant="outline" size="lg" className="w-full">
          Manage subscription
        </Button>
      </SubscriptionDetailsButton>
    );
  }

  const onFreePlan = has?.({ plan: "free_org" }) ?? false;
  return (
    <CheckoutButton
      planId={plan.clerkPlanId}
      planPeriod={period}
      for="organization"
      onSubscriptionComplete={() => toast.success(`Welcome to ${plan.name}`)}
      newSubscriptionRedirectUrl={
        organization?.slug ? `/${organization.slug}/settings/billing` : undefined
      }
    >
      <Button variant={variant} size="lg" className="w-full">
        {onFreePlan ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
      </Button>
    </CheckoutButton>
  );
}
