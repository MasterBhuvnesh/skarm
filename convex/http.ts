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

type GithubEvent = {
  action?: string;
  installation?: { id?: number };
  repository?: { full_name?: string };
  repositories?: { full_name?: string }[];
  repositories_added?: { full_name?: string }[];
  repositories_removed?: { full_name?: string }[];
  sender?: { type?: string };
  issue?: {
    number: number;
    title?: string;
    body?: string | null;
    state_reason?: string | null;
  };
  comment?: {
    body?: string;
    user?: { login?: string; type?: string };
  };
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
 * GitHub App webhook (one per deployment, secret in GITHUB_WEBHOOK_SECRET).
 * Installation events keep each org's repo list in sync; pull_request
 * events link PRs to issues by identifier and drive status changes
 * (opened → in_review, merged → done).
 */
http.route({
  path: "/github-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error("GITHUB_WEBHOOK_SECRET is not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    if (
      !signature ||
      !(await verifyGithubSignature(secret, payload, signature))
    ) {
      return new Response("Invalid signature", { status: 401 });
    }

    const eventType = request.headers.get("x-github-event");
    const event = JSON.parse(payload) as GithubEvent;
    const installationId = event.installation?.id;
    if (!installationId) {
      return new Response(null, { status: 200 });
    }

    if (
      eventType === "installation" ||
      eventType === "installation_repositories"
    ) {
      const names = (repos?: { full_name?: string }[]) =>
        repos?.flatMap((repo) => (repo.full_name ? [repo.full_name] : []));
      await ctx.runMutation(internal.integrations.handleInstallationEvent, {
        installationId,
        action: event.action ?? "",
        repositories: names(event.repositories),
        repositoriesAdded: names(event.repositories_added),
        repositoriesRemoved: names(event.repositories_removed),
      });
      return new Response(null, { status: 200 });
    }

    // GitHub → Skarm issue sync. Bot senders are skipped: our own PATCHes
    // and attachment comments echo back as webhook events from the app bot,
    // and reacting to them would loop.
    if (eventType === "issues" || eventType === "issue_comment") {
      const isBot =
        event.sender?.type === "Bot" || event.comment?.user?.type === "Bot";
      const repo = event.repository?.full_name;
      const number = event.issue?.number;
      if (isBot || !repo || number === undefined) {
        return new Response(null, { status: 200 });
      }
      if (eventType === "issue_comment" && event.action === "created") {
        await ctx.runMutation(internal.github.sync.applyGithubIssueEvent, {
          installationId,
          repo,
          number,
          action: "commented",
          commentAuthor: event.comment?.user?.login,
          commentBody: event.comment?.body,
        });
      } else if (
        eventType === "issues" &&
        (event.action === "edited" ||
          event.action === "closed" ||
          event.action === "reopened")
      ) {
        await ctx.runMutation(internal.github.sync.applyGithubIssueEvent, {
          installationId,
          repo,
          number,
          action: event.action,
          title: event.issue?.title,
          body: event.issue?.body ?? undefined,
          stateReason: event.issue?.state_reason ?? undefined,
        });
      }
      return new Response(null, { status: 200 });
    }

    if (eventType !== "pull_request") {
      return new Response(null, { status: 200 });
    }

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
      installationId,
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

/**
 * GitHub App post-install redirect (the app's "Setup URL"). GitHub sends
 * the user here with ?installation_id=…&state=<nonce>; completeSetup binds
 * the installation to the org that minted the nonce, then we bounce the
 * user back to the workspace's integrations settings.
 */
http.route({
  path: "/github-setup",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const installationId = Number(url.searchParams.get("installation_id"));
    const nonce = url.searchParams.get("state");
    if (!nonce || !Number.isInteger(installationId)) {
      return new Response("Missing installation_id or state", { status: 400 });
    }

    const orgSlug = await ctx.runMutation(
      internal.integrations.completeSetup,
      { nonce, installationId }
    );
    if (orgSlug === null) {
      return new Response(
        "This install link expired - retry Connect from Settings → Integrations.",
        { status: 400 }
      );
    }

    const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${siteUrl}/${orgSlug}/settings/integrations` },
    });
  }),
});

/**
 * Figma OAuth callback: exchange the authorization code for tokens and
 * bind them to the org whose nonce started the flow, then bounce the user
 * back to the integrations settings page.
 */
http.route({
  path: "/figma-callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const nonce = url.searchParams.get("state");
    if (!code || !nonce) {
      return new Response("Missing code or state", { status: 400 });
    }
    const clientId = process.env.FIGMA_CLIENT_ID;
    const clientSecret = process.env.FIGMA_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response("Figma app not configured", { status: 500 });
    }

    const exchange = await fetch("https://api.figma.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        redirect_uri: `${process.env.CONVEX_SITE_URL}/figma-callback`,
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!exchange.ok) {
      console.error("Figma token exchange failed", await exchange.text());
      return new Response(
        "Figma authorization failed - retry Connect from Settings → Integrations.",
        { status: 400 }
      );
    }
    const tokens = (await exchange.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const orgSlug = await ctx.runMutation(
      internal.integrations.completeFigmaSetup,
      {
        nonce,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        expiresIn: tokens.expires_in ?? 0,
      }
    );
    if (orgSlug === null) {
      return new Response(
        "This connect link expired - retry Connect from Settings → Integrations.",
        { status: 400 }
      );
    }

    const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${siteUrl}/${orgSlug}/settings/integrations` },
    });
  }),
});

export default http;
