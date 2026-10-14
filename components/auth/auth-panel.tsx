import { MockApp } from "@/components/marketing/mock-app";

/**
 * Product context for the auth pages: the value proposition plus a real
 * product mock, so the screen reads as part of Skarm rather than a vendor
 * card dropped on a blank page.
 *
 * Everything here is reused from `components/marketing/` (MockApp, the hero's
 * grid mask, the SectionHeading type treatment) so the auth pages stay on the
 * same design language as the landing page without inventing a second one.
 * Desktop only; the shell hides this below `lg` and centres the form instead.
 */
export function AuthPanel() {
  return (
    <div className="relative flex h-full flex-col justify-center">
      {/* Same faded grid the hero uses, so the panel feels continuous with
          the marketing page it was reached from. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border),transparent_45%)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border),transparent_45%)_1px,transparent_1px)] bg-size-[64px_64px] mask-[radial-gradient(ellipse_60%_55%_at_50%_45%,black_20%,rgba(0,0,0,0.45)_55%,transparent_80%)]"
      />

      <p className="font-mono text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
        The AI-native issue tracker
      </p>

      <h2 className="mt-5 text-4xl font-medium tracking-tighter text-balance lg:text-[2.75rem]">
        Ship at the speed of thought
      </h2>

      <p className="mt-5 max-w-md text-base text-balance text-muted-foreground">
        Plan, track, and ship in a keyboard-first workspace, powered by an AI
        agent that handles the busywork.
      </p>

      {/* Purely decorative: a static mock, so keep its fake nav and issue
          rows out of the accessibility tree. */}
      <div aria-hidden className="mt-10 max-w-xl">
        <MockApp className="w-full" />
      </div>

      <p className="mt-8 text-[13px] text-muted-foreground">
        Free for teams of 3 · No credit card required
      </p>
    </div>
  );
}
