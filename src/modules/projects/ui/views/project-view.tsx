"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EyeIcon, CodeIcon, KeyRoundIcon, TerminalIcon } from "lucide-react";

import type { Fragment } from "@prisma/client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { UserControl } from "@/components/user-control";
import { FileExplorer } from "@/components/file-explorer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { PreviewPanel } from "../components/preview-panel";
import { TerminalPanel } from "../components/terminal-panel";
import { ProjectHeader } from "../components/project-header";
import { MessagesContainer } from "../components/messages-container";
import { WebContainerProvider } from "@/app/providers/webcontainer-provider";
import { AgentStatusProvider, useAgentStatus } from "@/app/providers/agent-status-provider";
import { MAX_FIX_RETRIES } from "@/hooks/use-agent-generate";
import { ErrorBoundary } from "react-error-boundary";

interface Props {
  projectId: string;
};

function AgentStatusBanner() {
  const { status, fixAttempt } = useAgentStatus();
  const isWorking = status === "streaming" || status === "submitted";
  if (!isWorking) return null;
  const isFixing = fixAttempt > 0;
  const message =
    isFixing
      ? `Agent is fixing issues (attempt ${fixAttempt} of ${MAX_FIX_RETRIES})`
      : status === "submitted"
        ? "Agent is thinking..."
        : "Agent is building...";
  return (
    <div
      className={
        isFixing
          ? "flex items-center gap-2 px-3 py-1.5 text-sm bg-amber-500/15 text-amber-700 dark:text-amber-400 border-b border-amber-500/30"
          : "flex items-center gap-2 px-3 py-1.5 text-sm bg-muted/50 text-muted-foreground border-b"
      }
    >
      <span className={isFixing ? "animate-pulse" : ""}>●</span>
      <span>{message}</span>
    </div>
  );
}

export const ProjectView = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const { data: hasApiKey } = useQuery(trpc.settings.hasApiKey.queryOptions());
  const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);
  const [tabState, setTabState] = useState<"preview" | "code" | "terminal">("preview");

  const initialFiles =
    activeFragment?.files && typeof activeFragment.files === "object"
      ? (activeFragment.files as Record<string, string>)
      : null;

  return (
    <AgentStatusProvider>
    <WebContainerProvider
      initialFiles={initialFiles ?? null}
      bootOnMount={!!(initialFiles && Object.keys(initialFiles).length > 0)}
    >
      <div className="h-screen">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel
            defaultSize={35}
            minSize={20}
            className="flex flex-col min-h-0"
          >
            <ErrorBoundary fallback={<p>Project header error</p>}>
            <Suspense fallback={<p>Loading project...</p>}>
              <ProjectHeader
                projectId={projectId}
                activeFragment={activeFragment}
              />
            </Suspense>
            </ErrorBoundary>
            <ErrorBoundary fallback={<p>Messages container error</p>}>
              <Suspense fallback={<p>Loading messages...</p>}>
                <MessagesContainer
                  projectId={projectId}
                  activeFragment={activeFragment}
                  setActiveFragment={setActiveFragment}
                />
              </Suspense>
            </ErrorBoundary>
          </ResizablePanel>
          <ResizableHandle className="hover:bg-primary transition-colors" />
          <ResizablePanel defaultSize={65} minSize={50}>
            <AgentStatusBanner />
            <Tabs
              className="h-full gap-y-0"
              defaultValue="preview"
              value={tabState}
              onValueChange={(value) =>
                setTabState(value as "preview" | "code" | "terminal")
              }
            >
              <div className="w-full flex items-center p-2 border-b gap-x-2">
                <TabsList className="h-8 p-0 border rounded-md">
                  <TabsTrigger value="preview" className="rounded-md">
                    <EyeIcon /> <span>Demo</span>
                  </TabsTrigger>
                  <TabsTrigger value="code" className="rounded-md">
                    <CodeIcon /> <span>Code</span>
                  </TabsTrigger>
                  <TabsTrigger value="terminal" className="rounded-md">
                    <TerminalIcon /> <span>Terminal</span>
                  </TabsTrigger>
                </TabsList>
                <div className="ml-auto flex items-center gap-x-2">
                  <Button asChild size="sm" variant="tertiary">
                    <Link href="/settings">
                      <KeyRoundIcon /> {hasApiKey ? "Manage API key" : "Add API key"}
                    </Link>
                  </Button>
                  <UserControl />
                </div>
              </div>
              <TabsContent value="preview" className="min-h-0">
                <PreviewPanel fragment={activeFragment} />
              </TabsContent>
              <TabsContent value="code" className="min-h-0">
                {!!activeFragment?.files && (
                  <FileExplorer
                    files={activeFragment.files as { [path: string]: string }}
                    downloadFilename={activeFragment.title || "generated-code"}
                  />
                )}
              </TabsContent>
              <TabsContent value="terminal" className="min-h-0">
                <TerminalPanel />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </WebContainerProvider>
    </AgentStatusProvider>
  );
};
