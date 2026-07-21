"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { renderDigestHtml } from "./template";

/**
 * SMTP delivery for email digests — provider-agnostic (Gmail, AWS SES,
 * Postmark, …). Credentials live only in Convex env:
 *   SMTP_USER / SMTP_PASSWORD  — SMTP username + password (app password for Gmail)
 *   SMTP_HOST                  — e.g. smtp.gmail.com, email-smtp.<region>.amazonaws.com
 *   SMTP_PORT                  — defaults to 465 (implicit TLS)
 *   SMTP_FROM                  — sender the provider allows, "Skarm <you@example.com>"
 *   APP_URL                    — base URL used for links in the email
 */

function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function transport() {
  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

/** Hourly cron entry point: queue every digest whose local schedule is due. */
export const sweep = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    if (!isEmailConfigured()) {
      return null; // silently off until SES creds are set
    }
    const due = await ctx.runQuery(internal.emailDigests.listDue, {
      now: Date.now(),
    });
    for (const digestId of due) {
      await ctx.scheduler.runAfter(0, internal.email.sendDigest.deliver, {
        digestId,
      });
    }
    return null;
  },
});

/** Plumbing check, runnable from the CLI without any digest configured:
    `npx convex run email/sendDigest:testTo '{"to":"you@example.com"}'`
    Sends a minimal email through the same SES transport and surfaces the
    raw SMTP error (auth, region, unverified identity) if anything is off. */
export const testTo = internalAction({
  args: { to: v.string() },
  returns: v.string(),
  handler: async (_ctx, args): Promise<string> => {
    if (!isEmailConfigured()) {
      return "SMTP_USER / SMTP_PASSWORD are not set";
    }
    const info = await transport().sendMail({
      from: process.env.SMTP_FROM ?? "Skarm <no-reply@example.com>",
      to: args.to,
      subject: "Skarm test email — SES SMTP is working",
      html: `<div style="font-family:sans-serif;padding:24px;">
        <p style="font-size:16px;"><strong>&#10047; Skarm</strong></p>
        <p>This is a test email from your Skarm deployment. If you are reading
        this, the SES SMTP configuration works end to end.</p>
      </div>`,
    });
    return `sent: ${info.messageId}`;
  },
});

/** Build, render, and send one digest. `force` skips the empty-digest skip
    (used by the settings page's "Send test" button). */
export const deliver = internalAction({
  args: { digestId: v.id("emailDigests"), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!isEmailConfigured()) {
      console.warn("Digest skipped: SMTP_USER/SMTP_PASSWORD not set");
      return null;
    }
    const data = await ctx.runQuery(internal.emailDigests.getDigestData, {
      digestId: args.digestId,
    });
    if (!data) {
      return null;
    }

    const empty = Object.values(data.sections).every(
      (rows) => rows === null || rows.length === 0
    );
    if (empty && !args.force) {
      // Nothing to report — skip today rather than sending an empty email.
      return null;
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const html = renderDigestHtml(data, appUrl);
    const counts = [
      data.sections.focus?.length && `${data.sections.focus.length} to focus`,
      data.sections.assigned?.length &&
        `${data.sections.assigned.length} assigned`,
      data.sections.mentions?.length &&
        `${data.sections.mentions.length} mentions`,
    ].filter(Boolean);
    const subject = `Your ${data.orgName} digest${counts.length ? ` — ${counts.join(", ")}` : ""}`;

    await transport().sendMail({
      from: process.env.SMTP_FROM ?? "Skarm <no-reply@example.com>",
      to: data.email,
      subject,
      html,
    });

    await ctx.runMutation(internal.emailDigests.markSent, {
      digestId: args.digestId,
    });
    return null;
  },
});
