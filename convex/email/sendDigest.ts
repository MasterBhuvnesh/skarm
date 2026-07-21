"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { renderDigestHtml } from "./template";

/**
 * SES SMTP delivery for email digests. Credentials live only in Convex env:
 *   SES_SMTP_USER / SES_SMTP_PASSWORD  — SES SMTP credentials
 *   SES_SMTP_HOST                      — region endpoint (email-smtp.<region>.amazonaws.com)
 *   SES_FROM_EMAIL                     — a VERIFIED SES identity, e.g. "Skarm <no-reply@example.com>"
 *   APP_URL                            — base URL used for links in the email
 */

function isEmailConfigured(): boolean {
  return Boolean(process.env.SES_SMTP_USER && process.env.SES_SMTP_PASSWORD);
}

function transport() {
  return nodemailer.createTransport({
    host: process.env.SES_SMTP_HOST ?? "email-smtp.us-east-1.amazonaws.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SES_SMTP_USER,
      pass: process.env.SES_SMTP_PASSWORD,
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

/** Build, render, and send one digest. `force` skips the empty-digest skip
    (used by the settings page's "Send test" button). */
export const deliver = internalAction({
  args: { digestId: v.id("emailDigests"), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!isEmailConfigured()) {
      console.warn("Digest skipped: SES_SMTP_USER/SES_SMTP_PASSWORD not set");
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
      from: process.env.SES_FROM_EMAIL ?? "Skarm <no-reply@example.com>",
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
