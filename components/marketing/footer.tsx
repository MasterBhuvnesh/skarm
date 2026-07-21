import Link from "next/link";

const COLUMNS: {
  heading: string;
  links: { label: string; href: string }[];
}[] = [
  {
    heading: "Product",
    links: [
      { label: "Issues", href: "/#issues" },
      { label: "Board & Cycles", href: "/#cycles" },
      { label: "AI Agent", href: "/#ai" },
      { label: "Keyboard-first", href: "/#keyboard" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Sign up", href: "/sign-up" },
      { label: "Log in", href: "/sign-in" },
      { label: "Open app", href: "/onboarding" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              {/* <span className="flex size-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
                C
              </span> */}
              Skarm
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The issue tracker built for speed. Plan, track, and ship with
              your whole team and an AI agent in one keyboard-first
              workspace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {COLUMNS.map((column) => (
              <nav key={column.heading} className="flex flex-col gap-2.5">
                <p className="mb-1 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                  {column.heading}
                </p>
                {column.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Skarm. All systems operational.
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Realtime sync · 99.99% uptime
          </p>
        </div>
      </div>
    </footer>
  );
}
