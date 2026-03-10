"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { MessageCard } from "@/modules/projects/ui/components/message-card";
import { WebContainerProvider } from "@/app/providers/webcontainer-provider";
import { PreviewPanel } from "@/modules/projects/ui/components/preview-panel";
import { FileExplorer } from "@/components/file-explorer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EyeIcon, CodeIcon, ExternalLinkIcon } from "lucide-react";

function ShareContent({ slug }: { slug: string }) {
  const trpc = useTRPC();
  const { data: share } = useSuspenseQuery(
    trpc.shares.getBySlug.queryOptions({ slug })
  );

  const project = share.project;
  const lastFragment = [...project.messages]
    .reverse()
    .find((m) => m.fragment)?.fragment;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 border-b flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            Shared project · {project.messages.length} messages
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ExternalLinkIcon className="size-4" />
            Build your own
          </Link>
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="w-[400px] border-r flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {project.messages.map((message) => (
              <MessageCard
                key={message.id}
                id={message.id}
                content={message.content}
                role={message.role}
                fragment={message.fragment}
                createdAt={message.createdAt}
                isActiveFragment={false}
                onFragmentClick={() => {}}
                type={message.type}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <WebContainerProvider
            initialFiles={
              lastFragment?.files && typeof lastFragment.files === "object"
                ? (lastFragment.files as Record<string, string>)
                : null
            }
            bootOnMount={
              !!(
                lastFragment?.files &&
                typeof lastFragment.files === "object" &&
                Object.keys(lastFragment.files as object).length > 0
              )
            }
          >
            <Tabs defaultValue="preview" className="h-full flex flex-col">
              <div className="p-2 border-b flex items-center gap-x-2">
                <TabsList>
                  <TabsTrigger value="preview">
                    <EyeIcon className="size-4" />
                    Demo
                  </TabsTrigger>
                  <TabsTrigger value="code">
                    <CodeIcon className="size-4" />
                    Code
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="preview" className="flex-1 min-h-0">
                <PreviewPanel fragment={lastFragment ?? null} />
              </TabsContent>
              <TabsContent value="code" className="flex-1 min-h-0">
                {lastFragment?.files && (
                  <FileExplorer
                    files={lastFragment.files as { [path: string]: string }}
                  />
                )}
              </TabsContent>
            </Tabs>
          </WebContainerProvider>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ShareContent slug={slug} />
    </Suspense>
  );
}
