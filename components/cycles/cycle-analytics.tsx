"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Burndown + velocity + scope stats for a cycle. Charts are hand-rolled
 * inline SVG (no chart dependency): theme-aware via CSS variables and
 * sized by viewBox so they scale with their container.
 */

const W = 600;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 34 };

function BurndownChart({
  days,
  startScope,
  cycle,
}: {
  days: { date: number; remaining: number }[];
  startScope: number;
  cycle: Doc<"cycles">;
}) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(startScope, ...days.map((d) => d.remaining), 1);
  const spanX = Math.max(cycle.endDate - cycle.startDate, 1);

  const x = (date: number) =>
    PAD.left + ((date - cycle.startDate) / spanX) * innerW;
  const y = (value: number) => PAD.top + (1 - value / maxY) * innerH;

  const actual = days
    .map((d) => `${x(d.date).toFixed(1)},${y(d.remaining).toFixed(1)}`)
    .join(" ");
  const area = `${PAD.left},${y(0)} ${actual} ${x(days[days.length - 1].date).toFixed(1)},${y(0)}`;

  const fmt = (date: number) =>
    new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Burndown chart: remaining points per day"
    >
      {/* gridlines at 0 / half / max */}
      {[0, maxY / 2, maxY].map((value) => (
        <g key={value}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 6}
            y={y(value) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {Math.round(value)}
          </text>
        </g>
      ))}
      {/* ideal guideline: start scope → 0 across the window */}
      <line
        x1={x(cycle.startDate)}
        y1={y(startScope)}
        x2={x(cycle.endDate)}
        y2={y(0)}
        stroke="var(--muted-foreground)"
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.5"
      />
      {/* actual remaining */}
      <polygon points={area} fill="var(--primary)" opacity="0.08" />
      <polyline
        points={actual}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {days.map((d) => (
        <circle
          key={d.date}
          cx={x(d.date)}
          cy={y(d.remaining)}
          r="2.5"
          fill="var(--primary)"
        >
          <title>{`${fmt(d.date)} - ${d.remaining} points remaining`}</title>
        </circle>
      ))}
      {/* x labels: start + end */}
      <text
        x={PAD.left}
        y={H - 8}
        fontSize="10"
        fill="var(--muted-foreground)"
      >
        {fmt(cycle.startDate)}
      </text>
      <text
        x={W - PAD.right}
        y={H - 8}
        textAnchor="end"
        fontSize="10"
        fill="var(--muted-foreground)"
      >
        {fmt(cycle.endDate)}
      </text>
    </svg>
  );
}

function VelocityChart({
  velocity,
}: {
  velocity: { label: string; points: number; current: boolean }[];
}) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(...velocity.map((v) => v.points), 1);
  const slot = innerW / velocity.length;
  const barW = Math.min(slot * 0.55, 64);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Velocity chart: completed points per cycle"
    >
      {[0, maxY / 2, maxY].map((value) => {
        const yPos = PAD.top + (1 - value / maxY) * innerH;
        return (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yPos}
              y2={yPos}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={yPos + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {Math.round(value)}
            </text>
          </g>
        );
      })}
      {velocity.map((entry, index) => {
        const barH = (entry.points / maxY) * innerH;
        const xPos = PAD.left + slot * index + (slot - barW) / 2;
        return (
          <g key={entry.label}>
            <rect
              x={xPos}
              y={PAD.top + innerH - barH}
              width={barW}
              height={Math.max(barH, entry.points > 0 ? 2 : 0)}
              rx="3"
              fill="var(--primary)"
              opacity={entry.current ? 1 : 0.45}
            >
              <title>{`${entry.label} - ${entry.points} points completed`}</title>
            </rect>
            <text
              x={xPos + barW / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {entry.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function CycleAnalytics({ cycle }: { cycle: Doc<"cycles"> }) {
  const analytics = useQuery(api.cycles.analytics, { cycleId: cycle._id });

  if (analytics === undefined) {
    return (
      <div className="grid gap-4 border-b px-4 py-5 lg:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (analytics.totalPoints === 0 && analytics.removedPoints === 0) {
    return null; // nothing scheduled yet - the issue list's empty state covers it
  }

  return (
    <div className="flex flex-col gap-4 border-b px-4 py-5">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Start scope" value={`${analytics.startScope} pts`} />
        <Stat label="Added" value={`+${analytics.addedPoints}`} />
        <Stat label="Removed" value={`−${analytics.removedPoints}`} />
        <Stat label="Completed" value={`${analytics.completedPoints} pts`} />
        <Stat label="Total scope" value={`${analytics.totalPoints} pts`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Burndown - points remaining
          </h3>
          <BurndownChart
            days={analytics.days}
            startScope={analytics.startScope}
            cycle={cycle}
          />
        </div>
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Velocity - points completed per cycle
          </h3>
          <VelocityChart velocity={analytics.velocity} />
        </div>
      </div>
    </div>
  );
}
