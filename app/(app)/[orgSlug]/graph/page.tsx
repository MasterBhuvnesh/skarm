"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { Loader2, Search, Sparkles, Waypoints } from "lucide-react";
import { useTheme } from "next-themes";
import { DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IssueFlowNode, IssueNode } from "@/components/graph/issue-node";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const nodeTypes = { issue: IssueNode };

const DRAG_TYPE = "application/cohere-issue";

type GraphData = FunctionReturnType<typeof api.graph.forScope>;
type RelationType = "blocks" | "blocked_by" | "related" | "duplicate_of";

const EDGE_COLORS: Record<GraphData["edges"][number]["type"], string> = {
  blocks: "var(--destructive)",
  related: "var(--muted-foreground)",
  duplicate_of: "#f2994a",
};

function toFlowEdge(edge: GraphData["edges"][number]): Edge {
  const color = EDGE_COLORS[edge.type];
  return {
    id: edge.relationId,
    source: edge.from,
    target: edge.to,
    label: edge.type === "duplicate_of" ? "duplicate" : edge.type,
    style: {
      stroke: color,
      strokeWidth: 2.25,
      ...(edge.type === "related" ? { strokeDasharray: "7 5" } : {}),
    },
    labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
    labelBgStyle: { fill: "transparent" },
    // n8n-style endpoints: open ring where the edge leaves, filled dot
    // where it lands (markers defined in EdgeMarkerDefs).
    markerStart: `url(#gd-ring-${edge.type})`,
    markerEnd: `url(#gd-fill-${edge.type})`,
  };
}

/** Circle markers (per edge color) referenced by toFlowEdge. */
function EdgeMarkerDefs() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
      <defs>
        {(
          Object.entries(EDGE_COLORS) as [keyof typeof EDGE_COLORS, string][]
        ).map(([type, color]) => (
          <g key={type}>
            <marker
              id={`gd-fill-${type}`}
              viewBox="0 0 8 8"
              refX="4"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <circle cx="4" cy="4" r="3" fill={color} />
            </marker>
            <marker
              id={`gd-ring-${type}`}
              viewBox="0 0 8 8"
              refX="4"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <circle
                cx="4"
                cy="4"
                r="2.5"
                fill="var(--background)"
                stroke={color}
                strokeWidth="1.5"
              />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  );
}

/**
 * Layered auto-layout: blockers sit left of what they block, so the
 * critical path reads left → right. Positions the user (or a drop) already
 * chose are kept.
 */
function layoutNodes(
  data: GraphData,
  keepPositions: Map<string, { x: number; y: number }>
): IssueFlowNode[] {
  const depth = new Map<string, number>(data.nodes.map((n) => [n.issueId, 0]));
  const blockEdges = data.edges.filter((e) => e.type === "blocks");
  for (let pass = 0; pass < data.nodes.length; pass++) {
    let changed = false;
    for (const edge of blockEdges) {
      const next = (depth.get(edge.from) ?? 0) + 1;
      if (next > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  const rows = new Map<number, number>();
  return data.nodes.map((node) => {
    const d = depth.get(node.issueId) ?? 0;
    const row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    return {
      id: node.issueId,
      type: "issue" as const,
      position: keepPositions.get(node.issueId) ?? {
        x: 40 + d * 320,
        y: 40 + row * 110,
      },
      data: node,
    };
  });
}

export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}

function GraphInner() {
  const { resolvedTheme } = useTheme();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const projects = useQuery(api.projects.list);
  const cycles = useQuery(api.cycles.listWithProgress);
  const teams = useQuery(api.teams.list);

  const [scope, setScope] = useState<string | null>(null);
  const [kind, scopeId] = scope?.split(":") ?? [null, null];
  const scopeArgs =
    kind === "project"
      ? { projectId: scopeId as Id<"projects"> }
      : kind === "cycle"
        ? { cycleId: scopeId as Id<"cycles"> }
        : null;
  const data = useQuery(api.graph.forScope, scopeArgs ?? "skip");

  const createRelation = useMutation(api.issueRelations.create);
  const removeRelation = useMutation(api.issueRelations.remove);
  const updateIssue = useMutation(api.issues.update);
  const savePositions = useMutation(api.graph.savePositions);

  const [nodes, setNodes, onNodesChange] = useNodesState<IssueFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Where dropped issues should appear once the query catches up.
  const droppedPositions = useRef(new Map<string, { x: number; y: number }>());

  const [pending, setPending] = useState<Connection | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  useEffect(() => {
    if (!data) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes((previous) => {
      // Saved layout first, then whatever this session already placed.
      const keep = new Map<string, { x: number; y: number }>();
      for (const saved of data.positions) {
        keep.set(saved.issueId, { x: saved.x, y: saved.y });
      }
      for (const node of previous) {
        keep.set(node.id, node.position);
      }
      for (const [id, position] of droppedPositions.current) {
        keep.set(id, position);
      }
      return layoutNodes(data, keep);
    });
    setEdges(data.edges.map(toFlowEdge));
  }, [data, setNodes, setEdges]);

  /** Persist the given arrangement for the current scope (fire and forget). */
  const persist = (arrangement: IssueFlowNode[]) => {
    if (!scopeArgs) {
      return;
    }
    savePositions({
      ...scopeArgs,
      positions: arrangement.map((node) => ({
        issueId: node.id as Id<"issues">,
        x: node.position.x,
        y: node.position.y,
      })),
    }).catch((error: unknown) => console.error("Layout save failed", error));
  };

  const onError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : "Something went wrong");
  };

  /** Discard manual positions and re-run the blocking-depth layout. */
  const autoArrange = () => {
    if (!data) {
      return;
    }
    droppedPositions.current.clear();
    const arranged = layoutNodes(data, new Map());
    setNodes(arranged);
    persist(arranged);
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 300 });
    });
  };

  const chooseRelation = (type: RelationType) => {
    if (!pending?.source || !pending.target) {
      return;
    }
    createRelation({
      issueId: pending.source as Id<"issues">,
      relatedIssueId: pending.target as Id<"issues">,
      type,
    }).catch(onError);
    setPending(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdge) {
      return;
    }
    removeRelation({
      relationId: selectedEdge.id as Id<"issueRelations">,
    }).catch(onError);
    setSelectedEdge(null);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const issueId = event.dataTransfer.getData(DRAG_TYPE);
    if (!issueId) {
      return;
    }
    if (!scopeArgs) {
      toast.error("Pick a project or cycle first");
      return;
    }
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    droppedPositions.current.set(issueId, position);
    updateIssue({ issueId: issueId as Id<"issues">, ...scopeArgs }).catch(
      onError
    );
    setNodes((current) => {
      persist([
        ...current,
        {
          id: issueId,
          type: "issue",
          position,
          data: {} as IssueFlowNode["data"],
        } as IssueFlowNode,
      ]);
      return current;
    });
  };

  // ── Search panel ──
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const results = useQuery(
    api.search.issues,
    debouncedQuery ? { query: debouncedQuery } : "skip"
  );
  const inScope = new Set(data?.nodes.map((n) => n.issueId) ?? []);
  const teamKey = new Map(teams?.map((team) => [team._id, team.key]) ?? []);
  const candidates = (results ?? []).filter(
    (issue) => !inScope.has(issue._id)
  );

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Waypoints className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Dependency graph</span>
        <span className="text-xs text-muted-foreground">
          {data ? `${data.nodes.length} issues · ${data.edges.length} relations` : ""}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
          <EdgeMarkerDefs />
          {scopeArgs === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Waypoints className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Pick a project or cycle on the right to map its dependencies.
              </p>
            </div>
          ) : data === undefined ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection) => setPending(connection)}
              onEdgeClick={(_, edge) => setSelectedEdge(edge)}
              onNodeDragStop={() =>
                setNodes((current) => {
                  persist(current);
                  return current;
                })
              }
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              deleteKeyCode={null}
              fitView
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls showInteractive={false} />
              <Panel position="top-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card shadow-sm"
                  onClick={autoArrange}
                >
                  <Sparkles className="size-3.5" />
                  Auto-arrange
                </Button>
              </Panel>
            </ReactFlow>
          )}
          {scopeArgs !== null && data !== undefined && data.nodes.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs text-muted-foreground">
              Nothing here yet — search on the right and drag issues onto the
              canvas.
            </p>
          )}
        </div>

        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3">
          <Select value={scope ?? ""} onValueChange={(value) => setScope(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a project or cycle…" />
            </SelectTrigger>
            <SelectContent>
              {(projects ?? []).length > 0 && (
                <SelectGroup>
                  <SelectLabel>Projects</SelectLabel>
                  {projects?.map((project) => (
                    <SelectItem key={project._id} value={`project:${project._id}`}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {(cycles ?? []).length > 0 && (
                <SelectGroup>
                  <SelectLabel>Cycles</SelectLabel>
                  {cycles?.map((cycle) => (
                    <SelectItem key={cycle._id} value={`cycle:${cycle._id}`}>
                      {cycle.teamKey} · {cycle.name ?? `Cycle ${cycle.number}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          <InputGroup className="h-8">
            <InputGroupAddon>
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search issues to add…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>

          {debouncedQuery === "" ? (
            <p className="text-xs text-muted-foreground">
              Search any issue, then drag it onto the canvas to pull it into
              this {kind ?? "scope"} and wire up its dependencies. Drag from a
              card&apos;s right dot to another card&apos;s left dot to create a
              relation; click an edge to remove it.
            </p>
          ) : results === undefined ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No matching issues outside this scope.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.slice(0, 20).map((issue) => (
                <div
                  key={issue._id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, issue._id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="cursor-grab rounded-md border bg-card px-2.5 py-2 shadow-xs transition-colors hover:bg-accent active:cursor-grabbing"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {teamKey.get(issue.teamId) ?? "?"}-{issue.number}
                    </span>
                    <StatusIcon status={issue.status} />
                    <PriorityIcon priority={issue.priority} />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs font-medium">
                    {issue.title}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Relation type picker for a just-drawn edge */}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">
              How do these issues relate?
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["blocks", "Blocks", "This issue blocks the other one", EDGE_COLORS.blocks],
                ["blocked_by", "Blocked by", "This issue is blocked by the other one", EDGE_COLORS.blocks],
                ["related", "Related", "Loosely connected", EDGE_COLORS.related],
                ["duplicate_of", "Duplicate of", "This issue duplicates the other one", EDGE_COLORS.duplicate_of],
              ] as const
            ).map(([type, label, hint, color]) => (
              <button
                key={type}
                type="button"
                onClick={() => chooseRelation(type)}
                className="flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
                <span className="pl-4 text-xs text-muted-foreground">
                  {hint}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edge actions */}
      <Dialog
        open={selectedEdge !== null}
        onOpenChange={(open) => !open && setSelectedEdge(null)}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Remove this {String(selectedEdge?.label ?? "relation")} link?
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEdge(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteSelectedEdge}
            >
              Remove relation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
