import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Recurring issue templates run at day granularity (9:00 UTC), so polling
// every 15 minutes keeps creation timely without meaningful load.
crons.interval(
  "run recurring issue templates",
  { minutes: 15 },
  internal.issueTemplates.runDue,
  {}
);

// Email digests target user-local hours (morning/evening); an hourly sweep
// catches every timezone's window exactly once per local day.
crons.hourly(
  "send due email digests",
  { minuteUTC: 0 },
  internal.email.sendDigest.sweep,
  {}
);

export default crons;
