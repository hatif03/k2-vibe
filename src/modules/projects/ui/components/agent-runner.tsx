"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { useWebContainerOptional } from "@/app/providers/webcontainer-provider";
import { useAgentStatus, useSetAgentStatus, useAgentSteps, useSetAgentTriggerFix } from "@/app/providers/agent-status-provider";
import { useAgentGenerate } from "@/hooks/use-agent-generate";
import { useTRPC } from "@/trpc/client";

import { MessageLoading } from "./message-loading";
import type { Fragment } from "@prisma/client";

const THINKING_TIMEOUT_MS = 45_000;

interface Props {
  projectId: string;
  messages: Array<{ id: string; role: string; content: string }>;
  isLastMessageUser: boolean;
  activeFragment: Fragment | null;
  retryRequested?: boolean;
  onRetryComplete?: () => void;
}

export function AgentRunner({
  projectId,
  messages,
  isLastMessageUser,
  activeFragment,
  retryRequested = false,
  onRetryComplete,
}: Props) {
  const wc = useWebContainerOptional();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const lastHandledRef = useRef<string | null>(null);
  const wcErrorToastShownRef = useRef(false);
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  const setAgentStatus = useSetAgentStatus();
  const setTriggerFix = useSetAgentTriggerFix();
  const { agentStatus } = useAgentStatus();
  const { addStep, clearSteps } = useAgentSteps();
  const getWebContainerWhenReady = useCallback(() => {
    if (!wc) return Promise.reject(new Error("WebContainer not available"));
    return wc.getWebContainerWhenReady();
  }, [wc]);

  const { status, fixAttempt, runAgent, runFixForExistingProject } = useAgentGenerate({
    projectId,
    messages,
    boot: wc?.boot ?? (() => Promise.resolve(null)),
    getWebContainerWhenReady,
    getTerminalOutput: () => wc?.terminalOutput ?? "",
    getPreviewUrl: () =>
      wc?.state?.status === "ready" && "previewUrl" in wc.state
        ? (wc.state as { previewUrl: string }).previewUrl
        : null,
    onStep: addStep,
    onSaved: () => {
      queryClient.invalidateQueries(
        trpc.messages.getMany.queryOptions({ projectId })
      );
      queryClient.invalidateQueries(trpc.usage.status.queryOptions());
    },
    onError: (msg) => {
      toast.error(msg);
      if (msg.includes("credits")) router.push("/settings");
    },
  });

  useEffect(() => {
    setAgentStatus((prev) => ({ ...prev, status, fixAttempt }));
  }, [status, fixAttempt, setAgentStatus]);

  useEffect(() => {
    if (status === "submitted") clearSteps();
  }, [status, clearSteps]);

  // Reset toast ref when WebContainer recovers (e.g. after retry)
  useEffect(() => {
    if (wc?.state.status !== "error") {
      wcErrorToastShownRef.current = false;
    }
  }, [wc?.state.status]);

  useEffect(() => {
    if (!isLastMessageUser || !messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "USER") return;
    if (!retryRequested && lastHandledRef.current === lastMsg.id) return;
    if (status !== "ready" && status !== undefined) return;

    if (wc?.state.status === "error") {
      if (!wcErrorToastShownRef.current) {
        wcErrorToastShownRef.current = true;
        toast.error("WebContainer failed to start");
      }
      return;
    }

    if (retryRequested) {
      lastHandledRef.current = null;
      onRetryComplete?.();
    }
    lastHandledRef.current = lastMsg.id;
    runAgent();
  }, [isLastMessageUser, messages, status, wc, runAgent, retryRequested, onRetryComplete]);

  useEffect(() => {
    if (!isLastMessageUser && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "ASSISTANT") {
        lastHandledRef.current = null;
      }
    }
  }, [isLastMessageUser, messages]);

  // Register triggerFix for manual "Fix errors" button (TerminalPanel)
  const triggerFixRef = useRef<() => void | null>(null);
  const hasFragment =
    activeFragment?.id &&
    activeFragment?.files &&
    typeof activeFragment.files === "object" &&
    Object.keys(activeFragment.files as Record<string, string>).length > 0;
  triggerFixRef.current = hasFragment
    ? () => {
        const lastUserMsg = messages.findLast((m) => m.role === "USER")?.content ?? "";
        const files = activeFragment!.files as Record<string, string>;
        runFixForExistingProject(activeFragment!.id, files, lastUserMsg);
      }
    : null;

  useEffect(() => {
    setTriggerFix(hasFragment ? () => () => triggerFixRef.current?.() : null);
    return () => setTriggerFix(null);
  }, [hasFragment, activeFragment?.id ?? null, setTriggerFix]);

  // No auto-fix: user manually clicks "Fix errors automatically" in Terminal when needed.

  // Timeout when agent is stuck "building" for too long (streaming/submitted)
  const isWaitingForAgent = status === "streaming" || status === "submitted";
  useEffect(() => {
    if (!isWaitingForAgent || wc?.state.status !== "ready") {
      setShowTimeoutMessage(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowTimeoutMessage(true);
    }, THINKING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForAgent, wc?.state.status]);

  // Show loading when fixing (manual "Fix errors" or fix loop from initial build)
  const isFixing = !isLastMessageUser && (status === "streaming" || fixAttempt > 0);
  if (!isLastMessageUser && !isFixing) return null;

  // WebContainer failed: show inline error with retry instead of "Thinking..."
  if (wc?.state.status === "error") {
    return (
      <MessageLoading
        error={{
          message:
            "Preview environment couldn't start. Try Chrome or Edge, or refresh the page.",
          onRetry: () => wc.boot(),
        }}
      />
    );
  }

  const loadingMessage =
    wc?.state.status === "booting" || wc?.state.status === "mounting"
      ? "Starting environment..."
      : fixAttempt > 0
        ? `Fixing issues… (attempt ${fixAttempt})`
        : status === "streaming" || status === "submitted"
          ? "Building..."
          : "Thinking...";

  return (
    <MessageLoading
      streamingText={status === "streaming" ? "..." : undefined}
      statusMessage={loadingMessage}
      steps={agentStatus?.steps ?? []}
      timeoutMessage={
        showTimeoutMessage
          ? "This is taking longer than usual. Check your connection or try again."
          : undefined
      }
    />
  );
}
