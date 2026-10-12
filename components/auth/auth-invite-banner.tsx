import { Sparkles } from "lucide-react";

/**
 * Invite context shown above the Clerk form when the visitor arrived from an
 * organization invitation link. Purely informational: Clerk's prebuilt
 * component still runs the ticket flow, so this banner never gates or
 * influences authentication.
 */
export function AuthInviteBanner() {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-left"
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium">You have been invited</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Sign in or create an account with the invited email address to join
          the workspace.
        </p>
      </div>
    </div>
  );
}
