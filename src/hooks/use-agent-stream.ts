"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { WebContainer } from "@webcontainer/api";

type AgentTool = "terminal" | "writeFiles" | "readFiles" | "listDir" | "searchFiles";

function ensurePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function runTerminal(
  wc: WebContainer,
  command: string
): Promise<string> {
  const proc = await wc.spawn("sh", ["-c", command]);
  const chunks: string[] = [];
  const reader = proc.output.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(typeof value === "string" ? value : decoder.decode(value));
    }
  } finally {
    reader.releaseLock();
  }
  const output = chunks.join("");
  const exit = await proc.exit;
  if (exit !== 0) {
    return `Exit code ${exit}\n${output}`;
  }
  return output;
}

async function runWriteFiles(
  wc: WebContainer,
  files: Array<{ path: string; content: string }>,
  accumulatedFiles: Record<string, string>
): Promise<string> {
  for (const { path, content } of files) {
    const fullPath = ensurePath(path);
    const dir = fullPath.split("/").slice(0, -1).join("/");
    if (dir) {
      try {
        await wc.fs.mkdir(dir, { recursive: true });
      } catch {
        // dir may exist
      }
    }
    await wc.fs.writeFile(fullPath, content);
    accumulatedFiles[path] = content;
  }
  return `Wrote ${files.length} file(s)`;
}

async function runReadFiles(
  wc: WebContainer,
  files: string[]
): Promise<string> {
  const results: Array<{ path: string; content: string }> = [];
  for (const path of files) {
    try {
      const content = await wc.fs.readFile(ensurePath(path), "utf-8");
      results.push({ path, content });
    } catch (err) {
      results.push({
        path,
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return JSON.stringify(results);
}

async function runListDir(wc: WebContainer, path: string): Promise<string> {
  try {
    const entries = await wc.fs.readdir(ensurePath(path), {
      withFileTypes: true,
    });
    return JSON.stringify(
      entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory?.() ?? false,
      }))
    );
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runSearchFiles(
  wc: WebContainer,
  pattern: string,
  basePath?: string
): Promise<string> {
  const base = ensurePath(basePath ?? ".");
  const matches: Array<{ path: string; line: string; lineNumber: number }> = [];
  const regex = new RegExp(pattern, "gi");

  async function walk(dir: string) {
    let entries: { name: string; isDirectory?: () => boolean }[];
    try {
      entries = await wc.fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const fullPath = `${dir}/${e.name}`.replace(/\/+/g, "/");
      if (e.isDirectory?.()) {
        if (e.name !== "node_modules" && e.name !== ".next") {
          await walk(fullPath);
        }
      } else {
        try {
          const content = await wc.fs.readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          lines.forEach((line, i) => {
            if (regex.test(line)) {
              matches.push({ path: fullPath.replace(/^\//, ""), line, lineNumber: i + 1 });
            }
          });
        } catch {
          // skip binary or unreadable
        }
      }
    }
  }

  await walk(base);
  return JSON.stringify(matches.slice(0, 50));
}

export interface UseAgentStreamOptions {
  projectId: string;
  messages: Array<{ id: string; role: string; content: string }>;
  /** Get WebContainer when needed (e.g. for tool calls). Enables streaming plan before env is ready. */
  getWebContainerWhenReady: () => Promise<WebContainer>;
  onSaved?: () => void;
  onError?: (message: string) => void;
}

export function useAgentStream({
  projectId,
  messages,
  getWebContainerWhenReady,
  onSaved,
  onError,
}: UseAgentStreamOptions) {
  const filesRef = useRef<Record<string, string>>({});

  const uiMessages = messages.map((m) => ({
    id: m.id,
    role: m.role.toLowerCase() as "user" | "assistant" | "system",
    parts: [{ type: "text" as const, text: m.content }],
  }));

  const { messages: chatMessages, sendMessage, addToolOutput, setMessages, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent/stream",
      body: { projectId },
    }),
    messages: uiMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;

      let webContainer: WebContainer;
      try {
        webContainer = await getWebContainerWhenReady();
      } catch (err) {
        addToolOutput({
          tool: toolCall.toolName as AgentTool,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: err instanceof Error ? err.message : "WebContainer not ready",
        });
        return;
      }

      const toolName = toolCall.toolName as AgentTool;
      const args = (toolCall as { input?: Record<string, unknown> }).input ?? {};

      try {
        let output: string;
        switch (toolName) {
          case "terminal":
            output = await runTerminal(webContainer, args.command as string);
            break;
          case "writeFiles":
            output = await runWriteFiles(
              webContainer,
              args.files as Array<{ path: string; content: string }>,
              filesRef.current
            );
            break;
          case "readFiles":
            output = await runReadFiles(
              webContainer,
              args.files as string[]
            );
            break;
          case "listDir":
            output = await runListDir(webContainer, args.path as string);
            break;
          case "searchFiles":
            output = await runSearchFiles(
              webContainer,
              args.pattern as string,
              args.path as string | undefined
            );
            break;
          default:
            output = `Unknown tool: ${toolName}`;
        }
        addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      } catch (err) {
        addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: err instanceof Error ? err.message : String(err),
        });
      }
    },
    onFinish: useCallback(
      async ({
        message,
        isError,
      }: {
        message: { parts: Array<{ type: string; text?: string }> };
        isError: boolean;
      }) => {
        if (isError) {
          onError?.("Something went wrong. Please try again.");
          return;
        }
        const textPart = message.parts.find((p: { type: string }) => p.type === "text");
        const text = textPart && "text" in textPart ? (textPart.text ?? "") : "";
        const match = text.match(/<task_summary>([\s\S]*?)<\/task_summary>/);
        const taskSummary = match?.[1]?.trim() ?? (text.trim() || "Completed");
        const files = { ...filesRef.current };

        if (Object.keys(files).length === 0 && !taskSummary) {
          onError?.("No output generated. Please try again.");
          return;
        }

        try {
          const res = await fetch("/api/agent/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, taskSummary, files }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            onError?.(err?.error ?? "Failed to save result");
            return;
          }
          onSaved?.();
        } catch (err) {
          onError?.(err instanceof Error ? err.message : "Failed to save");
        }
      },
      [projectId, onSaved, onError]
    ),
    onError: useCallback(
      (err: Error) => {
        onError?.(err?.message ?? "An error occurred");
      },
      [onError]
    ),
  });

  useEffect(() => {
    setMessages(uiMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uiMessages is derived from messages; including it would cause unnecessary reruns
  }, [setMessages, messages]);

  const runAgent = useCallback(() => {
    filesRef.current = {};
    sendMessage();
  }, [sendMessage]);

  return {
    messages: chatMessages,
    status,
    runAgent,
  };
}
