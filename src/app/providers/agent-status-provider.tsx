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
} | null>(null);

export function useAgentStatus(): AgentStatus {
  const ctx = useContext(AgentStatusContext);
  return ctx?.agentStatus ?? { status: "ready", fixAttempt: 0, steps: [] };
}

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    status: "ready",
    fixAttempt: 0,
    steps: [],
  });

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

export function useAgentSteps() {
  const ctx = useContext(AgentStatusContext);
  return {
    addStep: ctx?.addStep ?? (() => {}),
    clearSteps: ctx?.clearSteps ?? (() => {}),
  };
}
