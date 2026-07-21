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

const STATUS_COLOR: Record<string, string> = {
  backlog: "#8f8f9a",
  todo: "#8f8f9a",
  in_progress: "#f2994a",
  in_review: "#5e6ad2",
  done: "#4cb782",
  canceled: "#8f8f9a",
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
  const priority = PRIORITY_LABEL[item.priority];
  return `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #ececf1;">
        <a href="${appUrl}${item.path}" style="text-decoration:none;color:#18181c;">
          <span style="font-family:Consolas,Menlo,monospace;font-size:12px;color:#6b6b76;">${escapeHtml(item.identifier)}</span>
          &nbsp;<span style="font-size:14px;">${escapeHtml(item.title)}</span>
        </a>
      </td>
      <td align="right" style="padding:10px 0;border-top:1px solid #ececf1;white-space:nowrap;">
        ${priority === "Urgent" ? `<span style="font-size:11px;color:#e5484d;font-weight:600;">Urgent&nbsp;·&nbsp;</span>` : ""}
        ${due ? `<span style="font-size:11px;color:${overdue ? "#e5484d" : "#6b6b76"};">${due}&nbsp;·&nbsp;</span>` : ""}
        <span style="font-size:11px;color:${STATUS_COLOR[item.status]};font-weight:600;">${STATUS_LABEL[item.status]}</span>
      </td>
    </tr>`;
}

function mentionRow(item: DigestMention, appUrl: string): string {
  return `
    <tr>
      <td colspan="2" style="padding:10px 0;border-top:1px solid #ececf1;">
        <a href="${appUrl}${item.path}" style="text-decoration:none;color:#18181c;">
          <span style="font-size:13px;"><strong>${escapeHtml(item.actorName)}</strong>
          <span style="color:#6b6b76;">mentioned you on</span>
          <span style="font-family:Consolas,Menlo,monospace;font-size:12px;color:#6b6b76;">${escapeHtml(item.identifier)}</span>
          ${escapeHtml(item.title)}</span>
          ${item.snippet ? `<br /><span style="font-size:12px;color:#6b6b76;">&ldquo;${escapeHtml(item.snippet)}&rdquo;</span>` : ""}
        </a>
      </td>
    </tr>`;
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
                <img src="https://cdn.corenexis.com/f/1H0MUw80rkA.svg" width="30" height="30" alt="Skarm" style="border-radius:7px;vertical-align:middle;" />
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
