import type { Metadata } from "next";
import { Cta } from "@/components/marketing/cta";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { FeaturesAi } from "@/components/marketing/features-ai";
import { FeaturesBoard } from "@/components/marketing/features-board";
import { FeaturesIssues } from "@/components/marketing/features-issues";
import { FeaturesKeyboard } from "@/components/marketing/features-keyboard";
import { Footer } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/hero";
import { LogoCloud } from "@/components/marketing/logo-cloud";
import { Testimonials } from "@/components/marketing/testimonials";

export const metadata: Metadata = {
  title: "Cohere - The AI-Native Issue Tracker",
  description:
    "Plan, track, and ship faster with issues, boards, and cycles in a keyboard-first workspace - powered by AI that handles the busywork. Free for teams of 3.",
};

export default function LandingPage() {
  return (
    <>
      <main>
        <Hero />
        <LogoCloud />
        <div id="features" className="scroll-mt-16">
          <FeaturesIssues />
        </div>
        <FeaturesBoard />
        <div id="ai" className="scroll-mt-16">
          <FeaturesAi />
        </div>
        <FeaturesKeyboard />
        <FeatureGrid />
        <Testimonials />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
