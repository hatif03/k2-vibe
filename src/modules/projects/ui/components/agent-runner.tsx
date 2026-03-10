"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { useWebContainerOptional } from "@/app/providers/webcontainer-provider";
import { useAgentStatus, useSetAgentStatus, useAgentSteps } from "@/app/providers/agent-status-provider";
import { useAgentGenerate, MAX_FIX_RETRIES } from "@/hooks/use-agent-generate";
import { useTRPC } from "@/trpc/client";

import { MessageLoading } from "./message-loading";

const THINKING_TIMEOUT_MS = 45_000;

interface Props {
  projectId: string;
  messages: Array<{ id: string; role: string; content: string }>;
  isLastMessageUser: boolean;
  retryRequested?: boolean;
  onRetryComplete?: () => void;
}

export function AgentRunner({
  projectId,
  messages,
  isLastMessageUser,
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
  const { agentStatus } = useAgentStatus();
  const { addStep, clearSteps } = useAgentSteps();
  const getWebContainerWhenReady = useCallback(() => {
    if (!wc) return Promise.reject(new Error("WebContainer not available"));
    return wc.getWebContainerWhenReady();
  }, [wc]);

  const { status, fixAttempt, runAgent } = useAgentGenerate({
    projectId,
    messages,
    boot: wc?.boot ?? (() => Promise.resolve(null)),
    getWebContainerWhenReady,
    getTerminalOutput: () => wc?.terminalOutput ?? "",
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

  if (!isLastMessageUser) return null;

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
        ? `Fixing issues… (attempt ${fixAttempt} of ${MAX_FIX_RETRIES})`
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
