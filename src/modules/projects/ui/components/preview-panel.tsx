"use client";

import { useState } from "react";
import { ExternalLinkIcon, Loader2Icon, RefreshCcwIcon } from "lucide-react";

import { Hint } from "@/components/hint";
import type { Fragment } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { useWebContainerOptional } from "@/app/providers/webcontainer-provider";

interface Props {
  /** Fragment from DB. sandboxUrl used as fallback when WebContainer not ready (legacy/deploy URLs). */
  fragment: Fragment | null;
}

export function PreviewPanel({ fragment }: Props) {
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const wc = useWebContainerOptional();

  const previewUrl =
    wc?.state.status === "ready"
      ? wc.state.previewUrl
      : fragment?.sandboxUrl ?? null;

  const isLoading =
    wc?.state.status === "booting" || wc?.state.status === "mounting";
  const isError = wc?.state.status === "error";

  const onRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleCopy = () => {
    if (!previewUrl) return;
    navigator.clipboard.writeText(previewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isError && wc.state.status === "error") {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center p-8 text-center">
        <p className="text-destructive font-medium">WebContainer failed to start</p>
        <p className="text-sm text-muted-foreground mt-2">
          {wc.state.error}
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Try Chrome or Edge. WebContainer requires a supported browser.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center gap-4">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {fragment?.files ? "Loading saved app..." : "Starting preview..."}
        </p>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">No preview yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          {fragment?.files
            ? "Your app is saved. The preview environment is starting."
            : "Create a project or wait for the agent to finish."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <Hint text="Refresh" side="bottom" align="start">
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCcwIcon />
          </Button>
        </Hint>
        <Hint text="Click to copy" side="bottom">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={copied}
            className="flex-1 justify-start text-start font-normal min-w-0"
          >
            <span className="truncate">{previewUrl}</span>
          </Button>
        </Hint>
        <Hint text="Open in a new tab" side="bottom" align="start">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(previewUrl, "_blank")}
          >
            <ExternalLinkIcon />
          </Button>
        </Hint>
      </div>
      <iframe
        key={iframeKey}
        className="h-full w-full min-h-0"
        sandbox="allow-forms allow-scripts allow-same-origin"
        loading="lazy"
        src={previewUrl}
      />
    </div>
  );
}
