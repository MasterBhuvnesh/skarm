/**
 * One-off backfill: push each organization's seat cap into Clerk.
 *
 * `convex/clerkSeats.ts` keeps `max_allowed_memberships` correct from now
 * on, but only for organizations that see a plan event. Existing workspaces
 * still carry the instance-wide default, so Free workspaces sit above their
 * cap and Enterprise workspaces sit below theirs. This walks every
 * organization once and sets the value their plan calls for.
 *
 * The plan comes from Clerk's own billing subscription rather than Convex,
 * matching `syncSubscription` in convex/webhooks.ts: the highest active or
 * upcoming paid plan wins, otherwise free.
 *
 * Zero dependencies - plain node, no install required.
 *
 *   node scripts/backfill-seat-caps.mjs            # dry run, changes nothing
 *   node scripts/backfill-seat-caps.mjs --apply    # writes to Clerk
 *
 * Reads CLERK_SECRET_KEY from the environment, or from .env.local.
 */

import { readFileSync } from "node:fs";

/**
 * Clerk's `max_allowed_memberships` per plan. 0 means unlimited, null means
 * Clerk billing owns the number and rejects external writes.
 *
 * Pro is billing-managed: its per-seat price makes the cap equal to the
 * seats purchased, and PATCHing it returns
 * 400 organization_member_limit_managed_by_billing. Pro's allowance has to
 * be set on the plan itself in the Clerk Dashboard.
 */
const SEAT_CAP = { free: 3, pro: null, enterprise: 0 };

const APPLY = process.argv.includes("--apply");

function secretKey() {
  if (process.env.CLERK_SECRET_KEY) {
    return process.env.CLERK_SECRET_KEY;
  }
  let text;
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error("CLERK_SECRET_KEY is not set and .env.local is missing");
  }
  const match = text.match(/^\s*CLERK_SECRET_KEY\s*=\s*(.+?)\s*$/m);
  if (!match) {
    throw new Error("CLERK_SECRET_KEY not found in .env.local");
  }
  return match[1].replace(/^["']|["']$/g, "");
}

const KEY = secretKey();

async function clerk(path, options = {}) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/** Every organization, following pagination rather than trusting one page. */
async function allOrganizations() {
  const out = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await clerk(`/organizations?limit=${limit}&offset=${offset}`);
    const rows = page.data ?? [];
    out.push(...rows);
    if (rows.length < limit) {
      return out;
    }
  }
}

/** Highest active/upcoming paid plan, else free - mirrors syncSubscription. */
async function planFor(orgId) {
  let subscription;
  try {
    subscription = await clerk(`/organizations/${orgId}/billing/subscription`);
  } catch {
    return "free"; // no subscription record at all
  }
  let plan = "free";
  for (const item of subscription.subscription_items ?? []) {
    const slug = item.plan?.slug;
    const active = item.status === "active" || item.status === "upcoming";
    if (!active) {
      continue;
    }
    if (slug === "enterprise") {
      return "enterprise"; // nothing outranks it
    }
    if (slug === "pro") {
      plan = "pro";
    }
  }
  return plan;
}

const organizations = await allOrganizations();
console.log(
  `${organizations.length} organizations. ${APPLY ? "APPLYING" : "Dry run"}.\n`
);

let changed = 0;
let alreadyCorrect = 0;
let skipped = 0;
let failed = 0;

for (const org of organizations) {
  const plan = await planFor(org.id);
  const want = SEAT_CAP[plan];
  const have = org.max_allowed_memberships;
  const label = `${org.name} [${plan}] ${have} -> ${want}`;

  if (want === null) {
    skipped++;
    console.log(
      `  skip    ${org.name} [${plan}] cap ${have} is managed by Clerk billing`
    );
    continue;
  }
  if (have === want) {
    alreadyCorrect++;
    console.log(`  ok      ${org.name} [${plan}] already ${have}`);
    continue;
  }
  if (!APPLY) {
    changed++;
    console.log(`  would   ${label}`);
    continue;
  }
  try {
    await clerk(`/organizations/${org.id}`, {
      method: "PATCH",
      body: JSON.stringify({ max_allowed_memberships: want }),
    });
    changed++;
    console.log(`  set     ${label}`);
  } catch (error) {
    failed++;
    console.log(`  FAILED  ${label}: ${error.message}`);
  }
}

console.log(
  `\n${APPLY ? "changed" : "would change"} ${changed}, ` +
    `already correct ${alreadyCorrect}, ` +
    `skipped (billing-managed) ${skipped}, failed ${failed}`
);
if (failed > 0) {
  process.exitCode = 1;
}
