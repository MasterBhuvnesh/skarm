import { ConvexHttpClient } from "convex/browser";
import { Metadata } from "next";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { PublicIssueView } from "@/components/share/public-issue-view";

/**
 * Public read-only issue page - reachable signed-out (proxy.ts allows
 * /share). The token in the URL is the entire capability; the Convex query
 * returns a sanitized view or null for revoked/unknown tokens.
 */

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function fetchSharedIssue(token: string) {
  return await convex.query(api.share.getByToken, { token });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const issue = await fetchSharedIssue(token);
  if (!issue) {
    return { title: "Shared issue" };
  }
  return {
    title: `${issue.identifier} · ${issue.title}`,
    description:
      issue.description?.slice(0, 150) ||
      `An issue shared from ${issue.orgName} on Skarm.`,
  };
}

export default async function SharedIssuePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const issue = await fetchSharedIssue(token);

  if (!issue) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The share link was revoked or never existed. Ask the person who sent
          it for a fresh one.
        </p>
        <Link
          href="/"
          className="mt-2 text-sm underline underline-offset-4 hover:text-foreground"
        >
          What is Skarm?
        </Link>
      </div>
    );
  }

  return <PublicIssueView issue={issue} />;
}
