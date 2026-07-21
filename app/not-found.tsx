import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SkarmLogo } from "@/components/shared/skarm-logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <SkarmLogo size={40} id="skarm-petal-404" className="mb-2" />
      <p className="font-mono text-xs text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button asChild size="sm" className="mt-2">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
