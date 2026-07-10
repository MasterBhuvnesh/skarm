import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

type ClerkEvent = {
  type: string;
  data: Record<string, unknown>;
};

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET is not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const payload = await request.text();

    let event: ClerkEvent;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkEvent;
    } catch (error) {
      console.error("Clerk webhook verification failed", error);
      return new Response("Verification failed", { status: 400 });
    }

    await ctx.runMutation(internal.webhooks.handleClerkEvent, {
      eventType: event.type,
      data: event.data,
    });

    return new Response(null, { status: 200 });
  }),
});

/** GitHub `X-Hub-Signature-256` check: HMAC-SHA256 over the raw payload. */
async function verifyGithubSignature(
  secret: string,
  payload: string,
  header: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  );
  const expected =
    "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (header.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

type GithubPullRequestEvent = {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: {
    number: number;
    title?: string;
    body?: string;
    html_url?: string;
    merged?: boolean;
    user?: { login?: string };
    head?: { ref?: string };
  };
};

/**
 * Per-org GitHub webhook: configure in the repo as
 * `https://<deployment>.convex.site/github-webhook?org=<orgId>` with the
 * secret from Settings → Integrations. Links PRs to issues by identifier
 * and drives status changes (opened → in_review, merged → done).
 */
http.route({
  path: "/github-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const org = new URL(request.url).searchParams.get("org");
    if (!org) {
      return new Response("Missing org query param", { status: 400 });
    }

    const integration = await ctx.runQuery(
      internal.integrations.getForWebhook,
      { orgId: org }
    );
    if (!integration) {
      return new Response("GitHub integration not connected", { status: 404 });
    }

    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    if (
      !signature ||
      !(await verifyGithubSignature(
        integration.webhookSecret,
        payload,
        signature
      ))
    ) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Disabled integrations ack silently so GitHub doesn't retry.
    if (!integration.enabled) {
      return new Response(null, { status: 200 });
    }

    if (request.headers.get("x-github-event") !== "pull_request") {
      return new Response(null, { status: 200 });
    }

    const event = JSON.parse(payload) as GithubPullRequestEvent;
    const pr = event.pull_request;
    const handledActions = [
      "opened",
      "reopened",
      "ready_for_review",
      "edited",
      "closed",
    ];
    if (!pr || !event.action || !handledActions.includes(event.action)) {
      return new Response(null, { status: 200 });
    }

    await ctx.runMutation(internal.integrations.handlePullRequest, {
      orgId: integration.orgId,
      merged: pr.merged === true,
      closed: event.action === "closed",
      repo: event.repository?.full_name ?? "",
      number: pr.number,
      title: pr.title ?? "",
      url: pr.html_url ?? "",
      authorLogin: pr.user?.login ?? "",
      text: `${pr.head?.ref ?? ""} ${pr.title ?? ""} ${pr.body ?? ""}`,
    });

    return new Response(null, { status: 200 });
  }),
});

export default http;
