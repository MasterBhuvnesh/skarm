import type { Metadata } from "next";
import { FeatureComparison } from "@/components/billing/feature-comparison";
import { PricingTable } from "@/components/billing/pricing-table";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free for small teams. Pro for AI superpowers. Enterprise for unlimited scale. Simple per-workspace pricing that grows with you.",
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-20">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          Pricing
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          Pricing that scales with your team
        </h1>
        <p className="max-w-lg text-sm text-muted-foreground text-balance">
          Free for small teams. Pro for AI superpowers. Enterprise for
          unlimited scale. Plans are billed per workspace - switch or cancel
          any time.
        </p>
      </div>

      <div className="mt-10">
        <PricingTable />
      </div>

      <div className="mt-16">
        <FeatureComparison />
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        All prices in USD. Annual billing shows the per-month equivalent.
        Questions about Enterprise?{" "}
        <a
          href="mailto:sales@skarm.studzee.in"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Talk to us
        </a>
        .
      </p>
    </main>
  );
}
