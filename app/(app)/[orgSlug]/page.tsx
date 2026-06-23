"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Workspace home — redirects to the first team's issues, or shows the
 * empty state nudging team creation (the sidebar has the create button).
 */
export default function WorkspaceHomePage() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const teams = useQuery(api.teams.list);
  const { has } = useAuth();
  const isAdmin = has?.({ role: "org:admin" }) ?? false;

  const seedDemoData = useMutation(api.seed.demoData);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (teams && teams.length > 0) {
      router.replace(`/${params.orgSlug}/team/${teams[0]._id}`);
    }
  }, [teams, router, params.orgSlug]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedDemoData({});
      toast.success(
        `Demo workspace ready - ${result.teams} teams, ${result.issues} issues, ${result.projects} projects.`
      );
      // Keep the spinner on; the reactive teams query redirects to the first team.
    } catch (error) {
      setSeeding(false);
      toast.error(
        error instanceof Error ? error.message : "Seeding demo data failed."
      );
    }
  };

  if (teams === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h2 className="text-lg font-medium">Welcome to Cohere</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create your first team from the sidebar to start tracking issues.
        </p>
        {isAdmin && (
          <>
            <Button
              size="sm"
              className="mt-3"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {seeding ? "Seeding…" : "Seed demo data"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Populates 3 teams with issues, projects, cycles and labels.
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}
