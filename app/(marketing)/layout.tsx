import Image from "next/image";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Marketing layout — Track F owns the landing page content, Track E owns
 * /pricing. Keep this nav minimal; don't add app logic here.
 */
const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "AI Agent", href: "/#ai" },
  { label: "Pricing", href: "/pricing" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <Image src="/cohere.png" alt="" width={26} height={26} />
            Cohere
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Show when="signed-out">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">Log in</Link>
              </Button>
              <Button size="sm" className="rounded-full px-4" asChild>
                <Link href="/sign-up">Sign up</Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button size="sm" className="rounded-full px-4" asChild>
                <Link href="/onboarding">Open app</Link>
              </Button>
            </Show>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
