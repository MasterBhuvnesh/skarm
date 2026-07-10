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

export default crons;
