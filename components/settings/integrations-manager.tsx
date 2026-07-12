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
import { FigmaIcon } from "@/components/shared/figma-icon";
import { GithubIcon } from "@/components/shared/github-icon";

function RepositoryList({ repositories }: { repositories: string[] }) {
  const [filter, setFilter] = useState("");
  const visible = filter
    ? repositories.filter((repo) =>
        repo.toLowerCase().includes(filter.toLowerCase())
      )
    : repositories;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Repositories
          {repositories.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 font-normal tabular-nums">
              {repositories.length}
            </span>
          )}
        </span>
        {repositories.length > 8 && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter repositories"
            className="h-6 w-36 rounded-md border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        )}
      </div>
      {repositories.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Syncing from GitHub — the list fills in as events arrive.
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No repositories match “{filter}”.
        </p>
      ) : (
        <div className="relative">
          <div className="mt-2 grid max-h-48 grid-cols-1 gap-x-3 gap-y-0.5 overflow-y-auto pb-6 sm:grid-cols-2">
            {visible.map((repo) => {
              const [owner, name] = repo.split("/");
              return (
                <div
                  key={repo}
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs"
                  title={repo}
                >
                  <GithubIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    <span className="text-muted-foreground">{owner}/</span>
                    <span className="font-medium">{name}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {/* Fade hint that the list scrolls. */}
          {visible.length > 12 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-background to-transparent" />
          )}
        </div>
      )}
    </div>
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
              <RepositoryList repositories={connection.repositories} />
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

      <FigmaCard />
    </div>
  );
}

function FigmaCard() {
  const data = useQuery(api.integrations.getFigma);
  const beginConnect = useMutation(api.integrations.beginFigmaConnect);
  const setEnabled = useMutation(api.integrations.setFigmaEnabled);
  const disconnect = useMutation(api.integrations.disconnectFigma);
  const [connecting, setConnecting] = useState(false);

  const onError = (error: unknown) => {
    setConnecting(false);
    toast.error(error instanceof Error ? error.message : "Something went wrong");
  };

  const connect = async () => {
    setConnecting(true);
    try {
      // Figma's OAuth consent screen, then back via /figma-callback.
      window.location.href = await beginConnect();
    } catch (error) {
      onError(error);
    }
  };

  const connection = data?.connection ?? null;

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-3 p-4">
        <FigmaIcon className="h-6 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Figma</div>
          <p className="truncate text-xs text-muted-foreground">
            {connection
              ? `Connected by ${connection.connectedByName} · ${formatRelativeTime(connection.connectedAt)}`
              : "Attach designs to issues with live name and thumbnail previews."}
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
            aria-label="Enable Figma integration"
          />
        )}
      </div>

      {data !== undefined && connection === null && !data.appConfigured && (
        <>
          <Separator />
          <p className="p-4 text-xs text-muted-foreground">
            The Figma app isn&apos;t configured on this deployment yet. Create
            one at figma.com → Developers → My apps with redirect URI{" "}
            <code className="rounded bg-muted px-1">
              {process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/figma-callback
            </code>
            , then run{" "}
            <code className="rounded bg-muted px-1">
              npx convex env set FIGMA_CLIENT_ID …
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1">
              npx convex env set FIGMA_CLIENT_SECRET …
            </code>
          </p>
        </>
      )}

      {connection && (
        <>
          <Separator />
          <div className="flex flex-col gap-3 p-4">
            <p className="text-xs text-muted-foreground">
              Paste a Figma file or frame link on any issue (Figma section in
              the issue sidebar) — the design&apos;s name and a thumbnail are
              fetched automatically.
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
                  <AlertDialogTitle>Disconnect Figma?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The stored access token is deleted and previews stop
                    updating. Already-linked designs stay on their issues.
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
  );
}
