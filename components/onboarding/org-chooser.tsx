"use client";

import {
  CreateOrganization,
  useOrganization,
  useOrganizationList,
} from "@clerk/nextjs";
import { Building2, Check, ChevronRight, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Organization chooser for /onboarding. Controlled (via useOrganizationList)
 * rather than the prebuilt <OrganizationList> so that:
 *  - accepting an invite revalidates the membership list in place - the
 *    joined org appears immediately, no full-page refresh (#9); and
 *  - when the user already has an ACTIVE org (e.g. just created one through
 *    Clerk's sign-up task), we redirect straight into it instead of showing
 *    the picker, which also fixes the marketing "Open app" → /onboarding
 *    landing (#8).
 * Also revalidates on window focus, for joins/creates in another tab.
 */
export function OrgChooser() {
  const router = useRouter();
  const { isLoaded, setActive, userMemberships, userInvitations } =
    useOrganizationList({
      userMemberships: { infinite: true },
      userInvitations: { infinite: true },
    });
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [busy, setBusy] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  // Already have an active workspace? Go straight into it.
  useEffect(() => {
    if (
      orgLoaded &&
      organization?.slug &&
      !redirectedRef.current
    ) {
      redirectedRef.current = true;
      router.replace(`/${organization.slug}`);
    }
  }, [orgLoaded, organization, router]);

  // Force-fresh Clerk's org data on mount and when the tab regains focus, so
  // an org just created/joined (here or in another tab) shows immediately.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void userMemberships?.revalidate?.();
        void userInvitations?.revalidate?.();
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userMemberships, userInvitations]);

  // While loading, or when redirecting into an active org, show a spinner
  // rather than flashing the picker.
  if (!isLoaded || !orgLoaded || organization) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="flex flex-col items-center gap-4">
        <CreateOrganization
          skipInvitationScreen
          afterCreateOrganizationUrl="/:slug"
        />
        <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>
          Back
        </Button>
      </div>
    );
  }

  const enter = async (organizationId: string, slug: string | null) => {
    setBusy(organizationId);
    try {
      await setActive({ organization: organizationId });
      router.push(slug ? `/${slug}` : "/");
    } catch (error) {
      setBusy(null);
      toast.error(
        error instanceof Error ? error.message : "Couldn't open the workspace"
      );
    }
  };

  const join = async (invitation: NonNullable<
    typeof userInvitations.data
  >[number]) => {
    setBusy(invitation.id);
    try {
      await invitation.accept();
      // Bring the new membership into the list, then drop into it.
      await userMemberships?.revalidate?.();
      await userInvitations?.revalidate?.();
      await enter(
        invitation.publicOrganizationData.id,
        invitation.publicOrganizationData.slug
      );
    } catch (error) {
      setBusy(null);
      toast.error(
        error instanceof Error ? error.message : "Couldn't join the workspace"
      );
    }
  };

  const memberships = userMemberships.data ?? [];
  const invitations = userInvitations.data ?? [];
  const hasNothing = memberships.length === 0 && invitations.length === 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      {memberships.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Your workspaces
          </h2>
          <div className="flex flex-col gap-1.5">
            {memberships.map((mem) => (
              <button
                key={mem.id}
                disabled={busy !== null}
                onClick={() =>
                  void enter(mem.organization.id, mem.organization.slug)
                }
                className="group flex items-center gap-3 rounded-xl border bg-card/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-accent hover:shadow-sm disabled:pointer-events-none disabled:opacity-60"
              >
                <OrgAvatar
                  name={mem.organization.name}
                  imageUrl={mem.organization.imageUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {mem.organization.name}
                  </span>
                  <RoleLabel admin={mem.role === "org:admin"} />
                </span>
                {busy === mem.organization.id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {invitations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Invitations
          </h2>
          <div className="flex flex-col gap-1.5">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] p-3"
              >
                <OrgAvatar
                  name={inv.publicOrganizationData.name}
                  imageUrl={inv.publicOrganizationData.imageUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {inv.publicOrganizationData.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Invited as {inv.role === "org:admin" ? "admin" : "member"}
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void join(inv)}
                >
                  {busy === inv.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Join
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasNothing && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-5 text-muted-foreground" />
          </span>
          <p className="max-w-[16rem] text-sm text-muted-foreground">
            You&apos;re not in any workspace yet. Create one to get started, or
            ask a teammate to invite you.
          </p>
        </div>
      )}

      <Button
        variant="outline"
        className="h-11 border-dashed"
        onClick={() => setMode("create")}
      >
        <Plus className="size-4" />
        Create a workspace
      </Button>
    </div>
  );
}

function RoleLabel({ admin }: { admin: boolean }) {
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`size-1.5 rounded-full ${admin ? "bg-amber-500" : "bg-muted-foreground/50"}`}
      />
      {admin ? "Admin" : "Member"}
    </span>
  );
}

function OrgAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary ring-1 ring-border">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
