"use client";

import { useEffect, useRef } from "react";
import { TerminalIcon, WrenchIcon } from "lucide-react";
import { useWebContainerOptional } from "@/app/providers/webcontainer-provider";
import { useAgentStatus, useAgentTriggerFix, HAS_ERROR_PATTERN } from "@/app/providers/agent-status-provider";
import { Button } from "@/components/ui/button";

export function TerminalPanel() {
  const wc = useWebContainerOptional();
  const preRef = useRef<HTMLPreElement>(null);
  const terminalOutput = wc?.terminalOutput ?? "";
  const triggerFix = useAgentTriggerFix();
  const { status } = useAgentStatus();
  const hasErrors = HAS_ERROR_PATTERN.test(terminalOutput);
  const canFix = hasErrors && triggerFix && status === "ready";

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            WebContainer output
          </span>
        </div>
        {canFix && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1.5 text-amber-600 hover:text-amber-500 hover:bg-amber-500/10"
            onClick={() => triggerFix?.()}
          >
            <WrenchIcon className="size-3.5" />
            Fix errors automatically
          </Button>
        )}
      </div>
      <pre
        ref={preRef}
        className="flex-1 overflow-auto p-4 font-mono text-xs text-[#c9d1d9] whitespace-pre-wrap break-words"
        style={{ minHeight: 200 }}
      >
        {terminalOutput || (
          <span className="text-muted-foreground">
            Terminal output will appear here when the project starts...
          </span>
        )}
      </pre>
    </div>
  );
}
