"use client";

import { useAuth, useOrganization, useUser } from "@clerk/nextjs";
import type {
  OrganizationCustomRoleKey,
  OrganizationInvitationResource,
  OrganizationMembershipResource,
} from "@clerk/nextjs/types";
import { useQuery } from "convex/react";
import { Loader2, Mail, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ENTERPRISE_PLAN, planForOrg, PRO_PLAN } from "@/lib/plans";

const ROLES: { value: OrganizationCustomRoleKey; label: string }[] = [
  { value: "org:member", label: "Member" },
  { value: "org:admin", label: "Admin" },
];

/** Return type of `useOrganization` as instantiated below (infinite lists). */
type OrgListsReturn = ReturnType<
  typeof useOrganization<{
    memberships: { infinite: true };
    invitations: { infinite: true };
  }>
>;

function clerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (
      error as { errors?: { longMessage?: string; message?: string }[] }
    ).errors;
    const first = errors?.[0];
    if (first?.longMessage ?? first?.message) {
      return first.longMessage ?? first.message ?? fallback;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function membershipDisplayName(
  membership: OrganizationMembershipResource
): string {
  const data = membership.publicUserData;
  const name = [data?.firstName, data?.lastName].filter(Boolean).join(" ");
  return name || (data?.identifier ?? "Unknown user");
}

/**
 * Members management: Clerk-backed member list, role management, removal,
 * and email invitations - with seat caps from the workspace plan.
 */
export function MembersManager() {
  const org = useQuery(api.organizations.current);
  const { has } = useAuth();
  const { isLoaded, organization, membership, memberships, invitations } =
    useOrganization({
      memberships: { infinite: true },
      invitations: { infinite: true },
    });

  if (!isLoaded || org === undefined || !organization) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (org === null) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        Workspace not found.
      </p>
    );
  }

  // Clerk billing is the live source of truth for the subscription; the
  // Convex org.plan lags by a webhook round-trip after checkout. Prefer
  // Clerk's has() so a just-upgraded workspace can invite immediately
  // instead of being blocked by the free-plan seat cap until the webhook
  // lands, falling back to the synced plan while has() resolves.
  const plan = has?.({ plan: ENTERPRISE_PLAN.slug })
    ? ENTERPRISE_PLAN
    : has?.({ plan: PRO_PLAN.slug })
      ? PRO_PLAN
      : planForOrg(org.plan);
  const isAdmin = membership?.role === "org:admin";
  const memberCount = memberships?.count ?? organization.membersCount;
  const pendingCount =
    invitations?.count ?? organization.pendingInvitationsCount;
  const seatsUsed = memberCount + pendingCount;
  const atSeatLimit = plan.maxSeats !== null && seatsUsed >= plan.maxSeats;

  return (
    <>
      <div>
        <h1 className="text-base font-semibold">Members</h1>
        <p className="text-xs text-muted-foreground">
          {memberCount} {memberCount === 1 ? "member" : "members"}
          {pendingCount > 0 && ` · ${pendingCount} pending`}
          {plan.maxSeats !== null
            ? ` · ${seatsUsed} of ${plan.maxSeats} seats used on ${plan.name}`
            : ` · unlimited seats on ${plan.name}`}
        </p>
      </div>

      {isAdmin && (
        <InviteMemberForm
          atSeatLimit={atSeatLimit}
          planName={plan.name}
          isFreePlan={plan.plan === "free"}
          onInvited={() => void invitations?.revalidate?.()}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">People</h2>
        <MembersTable isAdmin={isAdmin} memberships={memberships} />
      </section>

      {(invitations?.data?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Pending invitations</h2>
          <PendingInvitations isAdmin={isAdmin} invitations={invitations} />
        </section>
      )}
    </>
  );
}

function InviteMemberForm({
  atSeatLimit,
  planName,
  isFreePlan,
  onInvited,
}: {
  atSeatLimit: boolean;
  planName: string;
  isFreePlan: boolean;
  onInvited: () => void;
}) {
  const params = useParams<{ orgSlug: string }>();
  const { organization } = useOrganization();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationCustomRoleKey>("org:member");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const emailAddress = email.trim();
    if (!organization || !emailAddress || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await organization.inviteMember({ emailAddress, role });
      toast.success(`Invitation sent to ${emailAddress}`);
      setEmail("");
      onInvited();
    } catch (error) {
      toast.error(clerkErrorMessage(error, "Failed to send invitation"));
    } finally {
      setSubmitting(false);
    }
  };

  if (atSeatLimit) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-xs text-amber-600 dark:text-amber-400">
          All {planName} plan seats are in use.{" "}
          {isFreePlan
            ? "Upgrade to Pro for up to 10 seats, or Enterprise for unlimited members."
            : "Upgrade to Enterprise for unlimited members."}
        </p>
        <Button size="sm" asChild>
          <Link href={`/${params.orgSlug}/settings/billing`}>Upgrade</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex items-center gap-2"
    >
      <div className="relative flex-1">
        <Mail className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="email"
          required
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>
      <Select
        value={role}
        onValueChange={(value) => setRole(value as OrganizationCustomRoleKey)}
      >
        <SelectTrigger size="sm" className="w-28 gap-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={!email.trim() || submitting}>
        <UserPlus className="size-3.5" />
        Invite
      </Button>
    </form>
  );
}

function MembersTable({
  isAdmin,
  memberships,
}: {
  isAdmin: boolean;
  memberships: OrgListsReturn["memberships"];
}) {
  const { user } = useUser();

  const handleRoleChange = async (
    member: OrganizationMembershipResource,
    role: OrganizationCustomRoleKey
  ) => {
    try {
      await member.update({ role });
      toast.success(`${membershipDisplayName(member)} is now ${role === "org:admin" ? "an admin" : "a member"}`);
      await memberships?.revalidate?.();
    } catch (error) {
      toast.error(clerkErrorMessage(error, "Failed to update role"));
    }
  };

  const handleRemove = async (member: OrganizationMembershipResource) => {
    try {
      await member.destroy();
      toast.success(`Removed ${membershipDisplayName(member)}`);
      await memberships?.revalidate?.();
    } catch (error) {
      toast.error(clerkErrorMessage(error, "Failed to remove member"));
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-3 text-xs">User</TableHead>
            <TableHead className="text-xs">Joined</TableHead>
            <TableHead className="w-32 text-xs">Role</TableHead>
            {isAdmin && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {memberships?.data?.map((member) => {
            const isSelf = member.publicUserData?.userId === user?.id;
            const name = membershipDisplayName(member);
            return (
              <TableRow key={member.id} className="hover:bg-muted/20">
                <TableCell className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      name={name}
                      imageUrl={member.publicUserData?.imageUrl}
                      className="size-6"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 truncate text-xs font-medium">
                        {name}
                        {isSelf && (
                          <Badge
                            variant="secondary"
                            className="h-4 rounded-full px-1.5 text-[10px]"
                          >
                            You
                          </Badge>
                        )}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {member.publicUserData?.identifier}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">
                  {formatDate(member.createdAt)}
                </TableCell>
                <TableCell className="py-2">
                  {isAdmin && !isSelf ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        void handleRoleChange(
                          member,
                          value as OrganizationCustomRoleKey
                        )
                      }
                    >
                      <SelectTrigger size="sm" className="h-7 w-28 gap-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {member.role === "org:admin" ? "Admin" : "Member"}
                    </span>
                  )}
                </TableCell>
                {isAdmin && (
                  <TableCell className="py-2 pr-3 text-right">
                    {!isSelf && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${name}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Remove {name}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              They will immediately lose access to this
                              workspace and its issues. You can invite them
                              again later.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void handleRemove(member)}
                            >
                              Remove member
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {memberships?.hasNextPage && (
        <div className="border-t p-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={memberships.isFetching}
            onClick={() => memberships.fetchNext?.()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function PendingInvitations({
  isAdmin,
  invitations,
}: {
  isAdmin: boolean;
  invitations: OrgListsReturn["invitations"];
}) {
  const handleRevoke = async (invitation: OrganizationInvitationResource) => {
    try {
      await invitation.revoke();
      toast.success(`Invitation to ${invitation.emailAddress} revoked`);
      await invitations?.revalidate?.();
    } catch (error) {
      toast.error(clerkErrorMessage(error, "Failed to revoke invitation"));
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableBody>
          {invitations?.data?.map((invitation) => (
            <TableRow key={invitation.id} className="hover:bg-muted/20">
              <TableCell className="px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                    <Mail className="size-3 text-muted-foreground" />
                  </span>
                  <span className="text-xs font-medium">
                    {invitation.emailAddress}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2 text-xs text-muted-foreground">
                Invited {formatDate(invitation.createdAt)}
              </TableCell>
              <TableCell className="py-2 text-xs text-muted-foreground">
                {invitation.role === "org:admin" ? "Admin" : "Member"}
              </TableCell>
              {isAdmin && (
                <TableCell className="w-20 py-2 pr-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void handleRevoke(invitation)}
                  >
                    Revoke
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
