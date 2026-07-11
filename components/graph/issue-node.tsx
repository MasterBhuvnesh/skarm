"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { IssuePriority, IssueStatus } from "@/components/shared/issue-meta";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";
import { UserAvatar } from "@/components/shared/user-avatar";

export type IssueNodeData = {
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeName?: string;
  assigneeImageUrl?: string;
};

export type IssueFlowNode = Node<IssueNodeData, "issue">;

/** Mini issue card as a React Flow node: left = incoming, right = outgoing. */
export function IssueNode({ data }: NodeProps<IssueFlowNode>) {
  return (
    <div className="w-60 rounded-lg border bg-card px-3 py-2 shadow-sm transition-shadow hover:shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
      />
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {data.identifier}
        </span>
        <StatusIcon status={data.status} />
        <PriorityIcon priority={data.priority} />
        {data.assigneeName && (
          <span className="ml-auto">
            <UserAvatar
              name={data.assigneeName}
              imageUrl={data.assigneeImageUrl}
            />
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-xs font-medium">{data.title}</p>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}
