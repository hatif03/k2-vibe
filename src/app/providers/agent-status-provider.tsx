"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface AgentStep {
  id: string;
  message: string;
  done?: boolean;
}

export interface AgentStatus {
  status: "ready" | "submitted" | "streaming" | "error";
  fixAttempt: number;
  steps: AgentStep[];
}

const AgentStatusContext = createContext<{
  agentStatus: AgentStatus;
  setAgentStatus: (s: AgentStatus | ((prev: AgentStatus) => AgentStatus)) => void;
  addStep: (message: string, done?: boolean) => void;
  clearSteps: () => void;
  /** Trigger fix for existing fragment when demo has errors. Set by AgentRunner. */
  triggerFix: (() => void) | null;
  setTriggerFix: (fn: (() => void) | null) => void;
} | null>(null);

export function useAgentStatus(): AgentStatus {
  const ctx = useContext(AgentStatusContext);
  return ctx?.agentStatus ?? { status: "ready", fixAttempt: 0, steps: [] };
}

const HAS_ERROR_PATTERN =
  /Module not found|MODULE_NOT_FOUND|Can't resolve|Failed to compile|Import trace for requested module|\bError:\s+(?!0\b)/i;

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    status: "ready",
    fixAttempt: 0,
    steps: [],
  });
  const [triggerFix, setTriggerFix] = useState<(() => void) | null>(null);

  const addStep = useCallback((message: string, done = false) => {
    setAgentStatus((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        { id: crypto.randomUUID(), message, done },
      ],
    }));
  }, []);

  const clearSteps = useCallback(() => {
    setAgentStatus((prev) => ({ ...prev, steps: [] }));
  }, []);

  const value = {
    agentStatus,
    setAgentStatus,
    addStep,
    clearSteps,
    triggerFix,
    setTriggerFix,
  };
  return (
    <AgentStatusContext.Provider value={value}>
      {children}
    </AgentStatusContext.Provider>
  );
}

export function useSetAgentStatus() {
  const ctx = useContext(AgentStatusContext);
  return ctx?.setAgentStatus ?? (() => {});
}

export function useAgentTriggerFix() {
  const ctx = useContext(AgentStatusContext);
  return ctx?.triggerFix ?? null;
}

export function useSetAgentTriggerFix() {
  const ctx = useContext(AgentStatusContext);
  return ctx?.setTriggerFix ?? (() => {});
}

export { HAS_ERROR_PATTERN };

export function useAgentSteps() {
  const ctx = useContext(AgentStatusContext);
  return {
    addStep: ctx?.addStep ?? (() => {}),
    clearSteps: ctx?.clearSteps ?? (() => {}),
  };
}
