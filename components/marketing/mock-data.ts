import type {
  IssuePriority,
  IssueStatus,
} from "@/components/shared/issue-meta";

/**
 * Static sample data for the marketing product mocks. Kept in one place so
 * the mocks stay consistent (same people, labels, and issue identifiers
 * across the hero, board, cycle, and AI sections).
 */

export type MockLabel = { name: string; color: string };

export const MOCK_LABELS = {
  bug: { name: "Bug", color: "#f97316" },
  feature: { name: "Feature", color: "#8b5cf6" },
  performance: { name: "Performance", color: "#10b981" },
  design: { name: "Design", color: "#3b82f6" },
  infra: { name: "Infra", color: "#eab308" },
} satisfies Record<string, MockLabel>;

export type MockIssue = {
  id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee?: string;
  label?: MockLabel;
  due?: string;
};

export const MOCK_PEOPLE = {
  ada: "Ada Okafor",
  jonas: "Jonas Weber",
  mara: "Mara Lindqvist",
  theo: "Theo Park",
  ivy: "Ivy Chen",
  sam: "Sam Rivera",
} as const;

/** Grouped list shown inside the hero app window. */
export const HERO_ISSUE_GROUPS: {
  status: IssueStatus;
  label: string;
  issues: MockIssue[];
}[] = [
  {
    status: "in_progress",
    label: "In Progress",
    issues: [
      {
        id: "ENG-142",
        title: "Polish board drag physics on long columns",
        status: "in_progress",
        priority: "urgent",
        assignee: MOCK_PEOPLE.ada,
        label: MOCK_LABELS.design,
        due: "Jun 16",
      },
      {
        id: "ENG-139",
        title: "Fix flaky websocket reconnect after laptop resume",
        status: "in_progress",
        priority: "high",
        assignee: MOCK_PEOPLE.jonas,
        label: MOCK_LABELS.bug,
      },
      {
        id: "ENG-135",
        title: "Stream agent tool calls into the activity feed",
        status: "in_progress",
        priority: "medium",
        assignee: MOCK_PEOPLE.ivy,
        label: MOCK_LABELS.feature,
        due: "Jun 18",
      },
    ],
  },
  {
    status: "todo",
    label: "Todo",
    issues: [
      {
        id: "ENG-147",
        title: "Migrate issue search to the Skarm index",
        status: "todo",
        priority: "high",
        assignee: MOCK_PEOPLE.theo,
        label: MOCK_LABELS.performance,
      },
      {
        id: "ENG-146",
        title: "Cycle burndown drifts across weekend boundaries",
        status: "todo",
        priority: "medium",
        assignee: MOCK_PEOPLE.mara,
        label: MOCK_LABELS.bug,
        due: "Jun 20",
      },
      {
        id: "ENG-144",
        title: "Batch activity log writes during bulk triage",
        status: "todo",
        priority: "low",
        label: MOCK_LABELS.infra,
      },
    ],
  },
];

/** Kanban columns for the board mock. */
export const BOARD_COLUMNS: {
  status: IssueStatus;
  label: string;
  issues: MockIssue[];
}[] = [
  {
    status: "todo",
    label: "Todo",
    issues: [
      {
        id: "ENG-147",
        title: "Migrate issue search to the Skarm index",
        status: "todo",
        priority: "high",
        assignee: MOCK_PEOPLE.theo,
        label: MOCK_LABELS.performance,
      },
      {
        id: "ENG-146",
        title: "Cycle burndown drifts across weekends",
        status: "todo",
        priority: "medium",
        assignee: MOCK_PEOPLE.mara,
        label: MOCK_LABELS.bug,
      },
    ],
  },
  {
    status: "in_progress",
    label: "In Progress",
    issues: [
      {
        id: "ENG-142",
        title: "Polish board drag physics on long columns",
        status: "in_progress",
        priority: "urgent",
        assignee: MOCK_PEOPLE.ada,
        label: MOCK_LABELS.design,
      },
      {
        id: "ENG-139",
        title: "Fix flaky websocket reconnect",
        status: "in_progress",
        priority: "high",
        assignee: MOCK_PEOPLE.jonas,
        label: MOCK_LABELS.bug,
      },
    ],
  },
  {
    status: "in_review",
    label: "In Review",
    issues: [
      {
        id: "ENG-138",
        title: "Org switcher cold-start under 100ms",
        status: "in_review",
        priority: "high",
        assignee: MOCK_PEOPLE.ivy,
        label: MOCK_LABELS.performance,
      },
    ],
  },
  {
    status: "done",
    label: "Done",
    issues: [
      {
        id: "ENG-131",
        title: "Keyboard triage: single-key status & priority",
        status: "done",
        priority: "medium",
        assignee: MOCK_PEOPLE.sam,
        label: MOCK_LABELS.feature,
      },
      {
        id: "ENG-127",
        title: "Auth redirect loop on expired org session",
        status: "done",
        priority: "urgent",
        assignee: MOCK_PEOPLE.jonas,
        label: MOCK_LABELS.bug,
      },
    ],
  },
];

/** Per-day completed counts for the cycle mini chart (14-day cycle). */
export const CYCLE_BARS = [1, 2, 2, 4, 5, 5, 8, 10, 13, 15, 18, 21, 24, 26];
