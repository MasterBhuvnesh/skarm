import { cn } from "@/lib/utils";

/**
 * Outer "mat" around a product mock: soft border, faint tinted backdrop,
 * deep shadow. Gives screenshots the framed, premium look without imagery.
 */
export function MockFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-muted/40 p-1.5 shadow-2xl shadow-black/10 dark:bg-white/4 dark:shadow-black/50",
        className
      )}
    >
      <div className="overflow-hidden rounded-xl border bg-background">
        {children}
      </div>
    </div>
  );
}

/** macOS-style window chrome bar for product mocks. */
export function MockWindowBar({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-3 border-b bg-muted/30 px-3.5",
        className
      )}
    >
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
      </div>
      {title ? (
        <span className="font-mono text-[11px] text-muted-foreground">
          {title}
        </span>
      ) : null}
      {children}
    </div>
  );
}
