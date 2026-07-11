"use client";

import { FunctionReturnType } from "convex/server";
import { Printer } from "lucide-react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { priorityLabel, statusLabel } from "@/components/shared/issue-meta";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";

type SharedIssue = NonNullable<
  FunctionReturnType<typeof api.share.getByToken>
>;

/**
 * Read-only public issue view. "Export PDF" uses the browser's print-to-PDF
 * with print: styles for a clean document.
 * ponytail: window.print() covers PDF export; add a server-rendered PDF
 * pipeline if branded/offline exports are ever needed.
 */
export function PublicIssueView({ issue }: { issue: SharedIssue }) {
  return (
    <div className="print-doc mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10 print:max-w-none print:py-0">
      <header className="flex items-center justify-between gap-4 print:hidden">
        <span className="text-sm text-muted-foreground">
          Shared from <span className="font-medium">{issue.orgName}</span> ·{" "}
          {issue.teamName}
        </span>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Export PDF
        </Button>
      </header>

      <main className="mt-8 flex flex-col gap-4 print:mt-0">
        <span className="font-mono text-sm text-muted-foreground">
          {issue.identifier}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{issue.title}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-1.5">
            <StatusIcon status={issue.status} />
            {statusLabel(issue.status)}
          </span>
          <span className="flex items-center gap-1.5">
            <PriorityIcon priority={issue.priority} />
            {priorityLabel(issue.priority)}
          </span>
          {issue.estimate !== undefined && (
            <span className="text-muted-foreground">
              {issue.estimate} {issue.estimate === 1 ? "point" : "points"}
            </span>
          )}
          {issue.labels.map((label) => (
            <span
              key={label.name}
              className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
        </div>

        <Separator className="my-2" />

        {issue.description ? (
          <Streamdown className="text-sm leading-relaxed [&_a]:underline [&_code]:text-xs">
            {issue.description}
          </Streamdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
      </main>

      <footer className="mt-auto pt-16 print:hidden">
        <Separator className="mb-4" />
        <p className="text-xs text-muted-foreground">
          Read-only view ·{" "}
          {new Date(issue.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}{" "}
          · Shared with{" "}
          <Link
            href="/"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Cohere
          </Link>
          , the AI-native issue tracker.
        </p>
      </footer>
    </div>
  );
}
