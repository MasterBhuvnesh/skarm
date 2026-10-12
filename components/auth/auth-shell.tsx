import Link from "next/link";
import { MarketingThemeToggler } from "@/components/marketing/marketing-theme-toggler";
import { SkarmLogo } from "@/components/shared/skarm-logo";
import { AuthInviteBanner } from "@/components/auth/auth-invite-banner";
import { AuthPanel } from "@/components/auth/auth-panel";

/**
 * Shared chrome for /sign-in and /sign-up so the two pages cannot drift.
 *
 * Split layout: product context on one side, the Clerk form on the other.
 * The header mirrors `app/(marketing)/layout.tsx` (same height, blur, logo
 * lockup, theme toggle) so arriving here from the landing page is continuous
 * rather than a jump. Below `lg` the panel is dropped and the form centres.
 *
 * `invited` only controls whether the invite banner is shown. The Clerk
 * component in `children` is untouched either way, so invitation acceptance
 * and every other auth flow behave exactly as they do today.
 */
export function AuthShell({
  invited = false,
  children,
}: {
  invited?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <SkarmLogo size={26} tile />
            Skarm
          </Link>

          <div className="flex items-center gap-1.5">
            <MarketingThemeToggler />
          </div>
        </div>
      </header>

      <main className="flex flex-1">
        <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-2 lg:items-stretch lg:gap-16 lg:py-16">
          <div className="hidden lg:block">
            <AuthPanel />
          </div>

          <div className="flex w-full flex-col items-center justify-center">
            {/* Headline shown only on mobile, where the panel is hidden. The
                other headline is display:none at the same breakpoint, so
                exactly one h1 is ever exposed to the accessibility tree. */}
            <div className="mb-8 text-center lg:hidden">
              <h1 className="text-2xl font-medium tracking-tighter text-balance">
                Ship at the speed of thought
              </h1>
              <p className="mt-2 text-sm text-balance text-muted-foreground">
                The AI-native issue tracker for modern teams.
              </p>
            </div>

            <div className="w-full max-w-[26rem]">
              {invited ? <AuthInviteBanner /> : null}
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
