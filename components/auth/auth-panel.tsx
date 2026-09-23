import { SkarmLogo } from "../shared/skarm-logo";

/**
 * AuthPanel — left editorial column on sign-in / sign-up.
 * Theme-aware (light/dark via `dark:`) and desktop-only (lg+).
 * Near-black in dark mode matching the reference; soft zinc in light mode.
 * Footnote is the freemium line — no trusted-by logo strip.
 */
export function AuthPanel() {
  return (
    <aside
      aria-hidden
      className="relative hidden w-[46%] shrink-0 overflow-hidden bg-zinc-100 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 dark:bg-[#0a0a0c] xl:px-16"
    >
      {/* Vertical hairlines — light / dark */}
      <div
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(0 0 0 / 0.06) 1px, transparent 1px)",
          backgroundSize: "clamp(80px, 8vw, 128px) 100%",
          backgroundPosition: "center top",
          maskImage:
            "linear-gradient(to bottom, black 60%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
          backgroundSize: "clamp(80px, 8vw, 128px) 100%",
          backgroundPosition: "center top",
          maskImage:
            "linear-gradient(to bottom, black 60%, transparent 100%)",
        }}
      />
      {/* Indigo aura behind the headline */}
      <div
        className="pointer-events-none absolute left-[8%] top-[30%] h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-[70px] dark:bg-indigo-500/15"
      />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <SkarmLogo size={44} tile id="auth-panel-logo" />
        <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
          Skarm
        </span>
      </div>

      {/* Headline block */}
      <div className="relative z-10 max-w-[440px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-indigo-600 dark:text-[#8a93f5]">
          Built for modern teams
        </p>
        <h2 className="mt-5 text-[clamp(2rem,3.4vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-zinc-900 dark:text-white">
          Ship at the
          <br />
          speed of thought.
        </h2>
        <p className="mt-5 max-w-[380px] text-[15px] leading-relaxed text-zinc-500 dark:text-white/55">
          Plan, track, and ship faster with issues, boards, and cycles in a
          keyboard-first workspace.
        </p>
      </div>

      {/* Footnote — replaces the trusted-by logo strip */}
      <div className="relative z-10">
        <div className="mb-5 h-px w-24 bg-zinc-900/10 dark:bg-white/15" />
        <p className="text-[13px] text-zinc-500 dark:text-white/45">
          Free for teams of 3 · No credit card required
        </p>
      </div>
    </aside>
  );
}
