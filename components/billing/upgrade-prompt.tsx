"use client";

import { useOrganization } from "@clerk/nextjs";
import { CheckoutButton } from "@clerk/nextjs/experimental";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast, useSonner } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRO_PLAN } from "@/lib/plans";
import {
  matchPlanLimitMessage,
  PLAN_LIMIT_COPY,
  PlanLimitKind,
} from "./plan-limit-error";

/**
 * Upgrade prompt shown when an org hits a free-tier limit
 * (see convex/lib/limits.ts). Org admins get an inline Clerk checkout;
 * members are pointed at their admins.
 */
export function UpgradePromptDialog({
  open,
  onOpenChange,
  limit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limit: PlanLimitKind;
}) {
  const params = useParams<{ orgSlug?: string }>();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const copy = PLAN_LIMIT_COPY[limit];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-8 items-center justify-center rounded-md bg-primary/15">
            <Sparkles className="size-4 text-primary" />
          </div>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-3">
          {PRO_PLAN.highlights.map((highlight) => (
            <li
              key={highlight}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Check className="size-3.5 shrink-0 text-primary" />
              {highlight}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pricing">
              Compare plans
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
          {isAdmin ? (
            <CheckoutButton
              planId={PRO_PLAN.clerkPlanId}
              planPeriod="month"
              for="organization"
              onSubscriptionComplete={() => {
                toast.success("Welcome to Skarm Pro");
                onOpenChange(false);
              }}
              newSubscriptionRedirectUrl={
                params.orgSlug
                  ? `/${params.orgSlug}/settings/billing`
                  : undefined
              }
            >
              <Button size="sm">
                Upgrade to Pro · ${PRO_PLAN.monthlyPrice}/mo
              </Button>
            </CheckoutButton>
          ) : (
            <Button size="sm" disabled>
              Ask an admin to upgrade
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Toast ids already inspected for plan-limit errors. Module-level (not
 * per-instance) so that when more than one listener is mounted - the global
 * one in WorkspaceShell plus any slot-level mounts - exactly one instance
 * claims a given limit-error toast and opens the dialog.
 */
const seenToastIds = new Set<string | number>();

/**
 * Watches the global sonner toast stream for the free-plan limit error
 * messages thrown by convex/lib/limits.ts and surfaces the upgrade dialog.
 * Mounted once for the whole workspace in WorkspaceShell, so limit errors
 * toasted from anywhere (command palette create-issue, board quick-create,
 * project dialogs, settings) trigger the upgrade prompt. Additional mounts
 * (e.g. the issue-detail slot) are harmless no-ops thanks to the shared
 * seen-toast set. Renders nothing until a limit error appears.
 */
export function PlanLimitListener() {
  const { toasts } = useSonner();
  const pendingKindRef = useRef<PlanLimitKind | null>(null);
  const [limit, setLimit] = useState<PlanLimitKind | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    for (const t of toasts) {
      if (seenToastIds.has(t.id)) {
        continue;
      }
      seenToastIds.add(t.id);
      const title = typeof t.title === "string" ? t.title : "";
      const description =
        typeof t.description === "string" ? t.description : "";
      const match =
        matchPlanLimitMessage(title) ?? matchPlanLimitMessage(description);
      if (match) {
        pendingKindRef.current = match.kind;
      }
    }
    if (pendingKindRef.current === null) {
      return;
    }
    // Defer the state update out of the effect body so the toast render
    // commits first and we don't trigger a cascading synchronous render.
    // The pending kind lives in a ref so a re-run reschedules rather than
    // dropping it.
    const timer = window.setTimeout(() => {
      if (pendingKindRef.current !== null) {
        setLimit(pendingKindRef.current);
        setOpen(true);
        pendingKindRef.current = null;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (limit === null) {
    return null;
  }

  return (
    <UpgradePromptDialog open={open} onOpenChange={setOpen} limit={limit} />
  );
}
