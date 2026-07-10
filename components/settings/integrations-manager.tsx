"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { formatRelativeTime } from "@/components/issue-detail/format";

/* lucide-react dropped brand icons; the GitHub mark, inlined. */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function IntegrationsManager() {
  const data = useQuery(api.integrations.get);
  const beginInstall = useMutation(api.integrations.beginInstall);
  const setEnabled = useMutation(api.integrations.setEnabled);
  const disconnect = useMutation(api.integrations.disconnect);
  const [connecting, setConnecting] = useState(false);

  const onError = (error: unknown) => {
    setConnecting(false);
    toast.error(error instanceof Error ? error.message : "Something went wrong");
  };

  const connect = async () => {
    setConnecting(true);
    try {
      // GitHub shows its install screen where the user picks repositories,
      // then redirects back here via the app's Setup URL.
      window.location.href = await beginInstall();
    } catch (error) {
      onError(error);
    }
  };

  const connection = data?.connection ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <div>
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect external tools to your workspace.
        </p>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center gap-3 p-4">
          <GithubIcon className="size-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">GitHub</div>
            <p className="truncate text-xs text-muted-foreground">
              {connection
                ? `Connected by ${connection.connectedByName} · ${formatRelativeTime(connection.connectedAt)}`
                : "Link pull requests to issues and update statuses on merge."}
            </p>
          </div>
          {data === undefined ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : connection === null ? (
            <Button
              size="sm"
              disabled={!data.appConfigured || connecting}
              onClick={() => void connect()}
            >
              {connecting && <Loader2 className="size-3.5 animate-spin" />}
              Connect
            </Button>
          ) : (
            <Switch
              checked={connection.enabled}
              onCheckedChange={(enabled) =>
                setEnabled({ enabled }).catch(onError)
              }
              aria-label="Enable GitHub integration"
            />
          )}
        </div>

        {data !== undefined && connection === null && !data.appConfigured && (
          <>
            <Separator />
            <p className="p-4 text-xs text-muted-foreground">
              The GitHub App isn&apos;t configured on this deployment yet. An
              admin needs to create one (GitHub → Settings → Developer
              settings → GitHub Apps) with webhook URL{" "}
              <code className="rounded bg-muted px-1">
                {process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/github-webhook
              </code>
              , setup URL{" "}
              <code className="rounded bg-muted px-1">
                {process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/github-setup
              </code>{" "}
              (with redirect on install enabled), pull-request read
              permission, and pull request + installation events. Then run{" "}
              <code className="rounded bg-muted px-1">
                npx convex env set GITHUB_APP_SLUG your-app-slug
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1">
                npx convex env set GITHUB_WEBHOOK_SECRET whsec…
              </code>
            </p>
          </>
        )}

        {connection && (
          <>
            <Separator />
            <div className="flex flex-col gap-3 p-4">
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Repositories
                </span>
                {connection.repositories.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Syncing from GitHub — the list fills in as events arrive.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {connection.repositories.map((repo) => (
                      <span
                        key={repo}
                        className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs"
                      >
                        {repo}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Reference issues as{" "}
                <code className="rounded bg-muted px-1">ENG-42</code> in a
                branch name, PR title or body. Opened PRs move issues to In
                Review; merged PRs move them to Done. Manage repository access
                from your GitHub App installation settings.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit text-destructive hover:text-destructive"
                  >
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Events stop being processed for this workspace.
                      Already-linked pull requests stay on their issues. To
                      revoke repository access entirely, also uninstall the
                      app from GitHub.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnect().catch(onError)}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
