import { DigestData, DigestIssue, DigestMention } from "../emailDigests";

/**
 * Renders the digest email as self-contained, table-based HTML with inline
 * styles only - the subset of CSS that survives Gmail/Outlook. No external
 * images or fonts; the "logo" is a styled wordmark so nothing gets blocked.
 */

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  canceled: "Canceled",
};

/** Per-status chip palette: solid = badge fill, tint = pill background,
    text = readable accent for the label. glyph is a white badge symbol
    chosen from characters that render reliably across email clients. */
const STATUS_CHIP: Record<
  string,
  { solid: string; tint: string; text: string; glyph: string }
> = {
  backlog: { solid: "#64748b", tint: "#f1f5f9", text: "#475569", glyph: "●" },
  todo: { solid: "#3b82f6", tint: "#eef4ff", text: "#2563eb", glyph: "●" },
  in_progress: {
    solid: "#f2994a",
    tint: "#fff5eb",
    text: "#d97706",
    glyph: "●",
  },
  in_review: { solid: "#8b5cf6", tint: "#f4f1fe", text: "#7c3aed", glyph: "●" },
  done: { solid: "#22c55e", tint: "#eefdf3", text: "#16a34a", glyph: "✓" },
  canceled: { solid: "#ef4444", tint: "#fef1f1", text: "#dc2626", glyph: "×" },
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDue(dueDate: number | undefined, now: number): string {
  if (dueDate === undefined) return "";
  const days = Math.floor((dueDate - now) / (24 * 60 * 60 * 1000));
  if (days < 0) return `overdue ${-days}d`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

function issueRow(item: DigestIssue, appUrl: string, now: number): string {
  const due = formatDue(item.dueDate, now);
  const overdue = item.dueDate !== undefined && item.dueDate < now;
  const isUrgent = item.priority === "urgent";
  const chip = STATUS_CHIP[item.status] ?? STATUS_CHIP.todo;

  const meta = [
    isUrgent
      ? `<span style="font-size:11px;font-weight:700;color:#dc2626;">Urgent</span>`
      : "",
    due
      ? `<span style="font-size:11px;color:${overdue ? "#dc2626" : chip.text};opacity:0.9;">${due}</span>`
      : "",
    `<span style="font-size:11px;font-weight:600;color:${chip.text};">${STATUS_LABEL[item.status]}</span>`,
  ]
    .filter(Boolean)
    .join(`<span style="color:${chip.text};opacity:0.4;">&nbsp;&middot;&nbsp;</span>`);

  return `
    <tr><td style="padding:4px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${chip.tint};border-radius:12px;">
        <tr>
          <td width="44" style="padding:9px 2px 9px 10px;vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:${chip.solid};border-radius:8px;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${chip.glyph}</td>
            </tr></table>
          </td>
          <td style="padding:9px 6px 9px 2px;vertical-align:middle;">
            <a href="${appUrl}${item.path}" style="text-decoration:none;">
              <span style="font-family:Consolas,Menlo,monospace;font-size:11px;color:${chip.text};opacity:0.7;">${escapeHtml(item.identifier)}</span>
              <span style="font-size:14px;font-weight:600;color:${chip.text};">&nbsp;${escapeHtml(item.title)}</span>
            </a>
          </td>
          <td align="right" style="padding:9px 12px 9px 6px;vertical-align:middle;white-space:nowrap;">
            ${meta}
          </td>
        </tr>
      </table>
    </td></tr>`;
}

function mentionRow(item: DigestMention, appUrl: string): string {
  return `
    <tr><td style="padding:4px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1fe;border-radius:12px;">
        <tr>
          <td width="44" style="padding:11px 2px 11px 10px;vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:#8b5cf6;border-radius:8px;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">@</td>
            </tr></table>
          </td>
          <td style="padding:10px 12px 10px 2px;vertical-align:middle;">
            <a href="${appUrl}${item.path}" style="text-decoration:none;">
              <span style="font-size:13px;color:#3c4043;"><strong style="color:#7c3aed;">${escapeHtml(item.actorName)}</strong>
              <span style="color:#6b6b76;">mentioned you on</span>
              <span style="font-family:Consolas,Menlo,monospace;font-size:11px;color:#7c3aed;">${escapeHtml(item.identifier)}</span>
              ${escapeHtml(item.title)}</span>
              ${item.snippet ? `<br /><span style="font-size:12px;color:#6b6b76;">&ldquo;${escapeHtml(item.snippet)}&rdquo;</span>` : ""}
            </a>
          </td>
        </tr>
      </table>
    </td></tr>`;
}

function section(title: string, rows: string, emptyText: string): string {
  return `
    <tr><td style="padding:22px 32px 0 32px;">
      <p style="margin:0 0 2px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5e6ad2;">${title}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows || `<tr><td style="padding:10px 0;font-size:13px;color:#6b6b76;">${emptyText}</td></tr>`}
      </table>
    </td></tr>`;
}

export function renderDigestHtml(data: DigestData, appUrl: string): string {
  const now = Date.now();
  const greeting =
    data.timeOfDay === "evening" ? "Good evening" : "Good morning";
  const { assigned, inProgress, mentions, focus } = data.sections;

  const body = [
    focus &&
      section(
        "Needs your focus",
        focus.map((item) => issueRow(item, appUrl, now)).join(""),
        "Nothing overdue, due soon, or urgent. Clear runway."
      ),
    inProgress &&
      section(
        "In progress",
        inProgress.map((item) => issueRow(item, appUrl, now)).join(""),
        "Nothing in progress right now."
      ),
    assigned &&
      section(
        "Assigned to you",
        assigned.map((item) => issueRow(item, appUrl, now)).join(""),
        "No other open issues assigned to you."
      ),
    mentions &&
      section(
        "Mentions & replies",
        mentions.map((item) => mentionRow(item, appUrl)).join(""),
        "No new mentions since your last digest."
      ),
  ]
    .filter(Boolean)
    .join("");

  const settingsUrl = `${appUrl}/${data.orgSlug}/settings/mail`;

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Skarm digest</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    body { margin:0; padding:0; background-color:#f4f4f7; }
    table { border-collapse:collapse; }
    td { font-family:'Google Sans', Arial, sans-serif; color:#3c4043; }
    img { max-width:100%; height:auto; }
    @media screen and (max-width:600px) {
      .content { width:100% !important; max-width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Google Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" class="content" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#6a76e0,#4f5ac4);background-color:#5e6ad2;padding:18px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td align="left" style="vertical-align:middle;">
                <img src="https://i.postimg.cc/xkrFYybP/skarm-tile.jpg" width="30" height="30" alt="Skarm" style="border-radius:7px;vertical-align:middle;" />
                <span style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;vertical-align:middle;">&nbsp;&nbsp;Skarm</span>
              </td>
              <td align="right" style="vertical-align:middle;font-size:12px;color:#dfe2ff;">${escapeHtml(data.orgName)}</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0;font-size:15px;color:#18181c;">${greeting}, ${escapeHtml(data.name.split(" ")[0])} - here's where your work stands.</p>
        </td></tr>
        ${body}
        <tr><td style="padding:26px 32px 24px 32px;">
          <a href="${appUrl}/${data.orgSlug}" style="display:inline-block;background:#5e6ad2;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:9px 18px;border-radius:8px;">Open Skarm</a>
        </td></tr>
        <tr><td style="padding:14px 32px 20px 32px;border-top:1px solid #ececf1;">
          <p style="margin:0;font-size:11px;color:#9a9aa5;">
            You're getting this because email digests are on for ${escapeHtml(data.orgName)}.
            <a href="${settingsUrl}" style="color:#5e6ad2;">Change schedule or turn off</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
