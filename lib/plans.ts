/**
 * Single source of truth for Clerk billing plan data (Track E).
 *
 * Plan ids/slugs live here and ONLY here - never inline them in components.
 * `convex/lib/limits.ts` is the authoritative enforcement of free-tier caps;
 * the numbers here mirror it for display purposes.
 */

/** Convex `organizations.plan` values (synced from Clerk via webhooks). */
export type OrgPlan = "free" | "pro" | "enterprise";

/** Clerk plan slugs, usable with `has({ plan: <slug> })`. */
export type PlanSlug = "free_org" | "pro" | "enterprise";

export type BillingPeriod = "month" | "annual";

/** Clerk feature slugs attached to plans, usable with `has({ feature: <slug> })`. */
export const PLAN_FEATURES = {
  aiAgent: "ai_agent",
  unlimitedProjects: "unlimited_projects",
  unlimitedIssues: "unlimited_issues",
  unlimitedSeats: "unlimited_seats",
  unlimitedAi: "unlimited_ai",
  prioritySupport: "priority_support",
} as const;

export type PlanFeatureSlug =
  (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

/** Display mirror of `FREE_PLAN_LIMITS` in convex/lib/limits.ts. */
export const FREE_PLAN_DISPLAY_LIMITS = {
  seats: 3,
  projects: 2,
  issues: 100,
} as const;

export type PlanDefinition = {
  /** Convex `organizations.plan` value this plan maps to. */
  plan: OrgPlan;
  /** Clerk plan slug (for `has({ plan })`). */
  slug: PlanSlug;
  /** Clerk plan id (for `<CheckoutButton planId>` / `<PlanDetailsButton planId>`). */
  clerkPlanId: string;
  name: string;
  tagline: string;
  /** USD per month when billed monthly. */
  monthlyPrice: number;
  /** USD per month equivalent when billed annually. */
  annualMonthlyPrice: number;
  /** Extra pricing detail shown under the price (e.g. seat pricing). */
  priceNote?: string;
  /** Seat cap, or null for unlimited. */
  maxSeats: number | null;
  /** Marketing bullet list for the plan card. */
  highlights: string[];
  /** Lead-in line above the highlights, e.g. "Everything in Free, plus:". */
  highlightsLeadIn?: string;
  /** Whether to visually emphasize this plan on the pricing page. */
  popular?: boolean;
};

export const FREE_PLAN: PlanDefinition = {
  plan: "free",
  slug: "free_org",
  clerkPlanId: "cplan_3F1zEN33U3ist3e1eWPiu7xwDUg",
  name: "Free",
  tagline: "For small teams getting started with issue tracking.",
  monthlyPrice: 0,
  annualMonthlyPrice: 0,
  maxSeats: FREE_PLAN_DISPLAY_LIMITS.seats,
  highlights: [
    `Up to ${FREE_PLAN_DISPLAY_LIMITS.seats} members`,
    `${FREE_PLAN_DISPLAY_LIMITS.projects} projects`,
    `${FREE_PLAN_DISPLAY_LIMITS.issues} issues`,
    "Unlimited teams and cycles",
    "Kanban boards and saved views",
    "Realtime collaboration",
  ],
};

export const PRO_PLAN: PlanDefinition = {
  plan: "pro",
  slug: "pro",
  clerkPlanId: "cplan_3FXMPCVWYxFv5GLBi1C93gqRGfb",
  name: "Pro",
  tagline: "For growing teams that want AI superpowers and no limits.",
  monthlyPrice: 20,
  annualMonthlyPrice: 16,
  priceNote: "+$10 per seat after the first · up to 10 members",
  maxSeats: 10,
  highlightsLeadIn: "Everything in Free, plus:",
  highlights: [
    "Up to 10 members (seat-based)",
    "Unlimited projects and issues",
    "AI agent with workspace context",
    "50 AI messages per user per day",
    "Triage assist and duplicate detection",
  ],
  popular: true,
};

export const ENTERPRISE_PLAN: PlanDefinition = {
  plan: "enterprise",
  slug: "enterprise",
  clerkPlanId: "cplan_3FXMTzv5ifQQt6wUGD9AYl7G1dz",
  name: "Enterprise",
  tagline: "For organizations that need unlimited scale and support.",
  monthlyPrice: 99,
  annualMonthlyPrice: 79,
  priceNote: "Flat rate · unlimited members",
  maxSeats: null,
  highlightsLeadIn: "Everything in Pro, plus:",
  highlights: [
    "Unlimited members",
    "Unlimited AI usage",
    "Priority support",
    "Flat predictable pricing",
  ],
};

export const PLANS: PlanDefinition[] = [FREE_PLAN, PRO_PLAN, ENTERPRISE_PLAN];

const PLANS_BY_ORG_PLAN: Record<OrgPlan, PlanDefinition> = {
  free: FREE_PLAN,
  pro: PRO_PLAN,
  enterprise: ENTERPRISE_PLAN,
};

/** Resolve the plan definition for a Convex `organizations.plan` value. */
export function planForOrg(plan: OrgPlan): PlanDefinition {
  return PLANS_BY_ORG_PLAN[plan];
}

export function priceForPeriod(
  plan: PlanDefinition,
  period: BillingPeriod
): number {
  return period === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
}

export function formatPrice(amount: number): string {
  return `$${amount}`;
}

// ── Feature comparison table (pricing page) ────────────────────────────────

export type ComparisonValue = string | boolean;

export type ComparisonRow = {
  label: string;
  /** Values in PLANS order: [Free, Pro, Enterprise]. */
  values: [ComparisonValue, ComparisonValue, ComparisonValue];
};

export type ComparisonSection = {
  title: string;
  rows: ComparisonRow[];
};

export const COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    title: "Usage",
    rows: [
      {
        label: "Members",
        values: [
          `Up to ${FREE_PLAN_DISPLAY_LIMITS.seats}`,
          "Up to 10",
          "Unlimited",
        ],
      },
      {
        label: "Projects",
        values: [
          `${FREE_PLAN_DISPLAY_LIMITS.projects}`,
          "Unlimited",
          "Unlimited",
        ],
      },
      {
        label: "Issues",
        values: [
          `${FREE_PLAN_DISPLAY_LIMITS.issues}`,
          "Unlimited",
          "Unlimited",
        ],
      },
      { label: "Teams and cycles", values: ["Unlimited", "Unlimited", "Unlimited"] },
    ],
  },
  {
    title: "Features",
    rows: [
      { label: "Kanban boards and list views", values: [true, true, true] },
      { label: "Saved views and full-text search", values: [true, true, true] },
      { label: "Comments, mentions and activity", values: [true, true, true] },
      { label: "Realtime presence", values: [true, true, true] },
    ],
  },
  {
    title: "AI",
    rows: [
      { label: "AI agent", values: [false, true, true] },
      {
        label: "AI messages",
        values: [false, "50 / user / day", "Unlimited"],
      },
      { label: "Triage assist", values: [false, true, true] },
      { label: "Duplicate detection", values: [false, true, true] },
      { label: "Standup and cycle reports", values: [false, true, true] },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Community support", values: [true, true, true] },
      { label: "Priority support", values: [false, false, true] },
    ],
  },
];
