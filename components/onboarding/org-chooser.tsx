"use client";

import { CreateOrganization, useOrganizationList } from "@clerk/nextjs";
import { Building2, Check, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Organization chooser for /onboarding. Controlled (via useOrganizationList)
 * rather than the prebuilt <OrganizationList> so that accepting an invite
 * revalidates the membership list in place — the joined org appears
 * immediately instead of only after a full-page refresh (#9). Also
 * revalidates on window focus, for joins that happen in another tab.
 */
export function OrgChooser() {
  const router = useRouter();
  const { isLoaded, setActive, userMemberships, userInvitations } =
    useOrganizationList({
      userMemberships: { infinite: true },
      userInvitations: { infinite: true },
    });
  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [busy, setBusy] = useState<string | null>(null);

  // Refresh Clerk's org data when the tab regains focus, so a join completed
  // elsewhere (e.g. an emailed invite link) shows up without a manual reload.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void userMemberships?.revalidate?.();
        void userInvitations?.revalidate?.();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userMemberships, userInvitations]);

  if (!isLoaded) {
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
    <div className="flex w-full max-w-sm flex-col gap-5">
      {memberships.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground">
            Your workspaces
          </h2>
          {memberships.map((mem) => (
            <button
              key={mem.id}
              disabled={busy !== null}
              onClick={() =>
                void enter(mem.organization.id, mem.organization.slug)
              }
              className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
            >
              <OrgAvatar
                name={mem.organization.name}
                imageUrl={mem.organization.imageUrl}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {mem.organization.name}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {mem.role === "org:admin" ? "Admin" : "Member"}
                </span>
              </span>
              {busy === mem.organization.id && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </button>
          ))}
        </section>
      )}

      {invitations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground">
            Invitations
          </h2>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 rounded-lg border p-3"
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
        </section>
      )}

      {hasNothing && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <Building2 className="size-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            You&apos;re not in any workspace yet. Create one to get started, or
            ask a teammate to invite you.
          </p>
        </div>
      )}

      <Button variant="outline" onClick={() => setMode("create")}>
        <Plus className="size-4" />
        Create a workspace
      </Button>
    </div>
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
        className="size-8 shrink-0 rounded-md object-cover"
      />
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
