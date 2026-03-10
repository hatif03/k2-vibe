"use client";

import { useCallback, useRef, useState } from "react";
import { parseFileBlocks } from "@/lib/parse-file-blocks";
import { TEMPLATE_FILES } from "@/lib/template-flatten";
import type { WebContainer } from "@webcontainer/api";

export const MAX_FIX_RETRIES = 20;

function ensurePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function runWriteFiles(
  wc: WebContainer,
  files: Array<{ path: string; content: string }>,
  accumulatedFiles: Record<string, string>
): Promise<void> {
  for (const { path, content } of files) {
    const fullPath = ensurePath(path);
    const dir = fullPath.split("/").slice(0, -1).join("/");
    if (dir) {
      try {
        await wc.fs.mkdir(dir, { recursive: true });
      } catch {
        /* dir may exist */
      }
    }
    await wc.fs.writeFile(fullPath, content);
    accumulatedFiles[path] = content;
  }
}

async function runBuildAndCaptureOutput(wc: WebContainer): Promise<{
  success: boolean;
  output: string;
}> {
  const proc = await wc.spawn("npm", ["run", "build"]);
  const chunks: string[] = [];
  const reader = proc.output.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value != null) {
        chunks.push(typeof value === "string" ? value : decoder.decode(value, { stream: true }));
      }
    }
  } finally {
    reader.releaseLock();
  }
  const exitCode = await proc.exit;
  return {
    success: exitCode === 0,
    output: chunks.join(""),
  };
}

export interface UseAgentGenerateOptions {
  projectId: string;
  messages: Array<{ id: string; role: string; content: string }>;
  boot: (files?: Record<string, string>) => Promise<WebContainer | null>;
  getWebContainerWhenReady: () => Promise<WebContainer>;
  getTerminalOutput?: () => string;
  onSaved?: () => void;
  onError?: (message: string) => void;
  onStep?: (message: string, done?: boolean) => void;
}

export function useAgentGenerate({
  projectId,
  messages,
  boot,
  getWebContainerWhenReady,
  getTerminalOutput,
  onSaved,
  onError,
  onStep,
}: UseAgentGenerateOptions) {
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [fixAttempt, setFixAttempt] = useState(0);
  const filesRef = useRef<Record<string, string>>({});

  const runAgent = useCallback(async () => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "USER") return;

    setStatus("submitted");
    setFixAttempt(0);
    filesRef.current = {};
    onStep?.("Calling K2 Think API...");

    try {
      const res = await fetch("/api/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Request failed: ${res.status}`);
      }

      setStatus("streaming");
      onStep?.("Calling K2 Think API...", true);
      onStep?.("Parsing generated files...");
      const { content } = (await res.json()) as { content: string };
      const taskMatch = content.match(/<task_summary>([\s\S]*?)<\/task_summary>/);
      const taskSummary = taskMatch?.[1]?.trim() ?? (content.trim() || "Completed");
      const parsedFiles = parseFileBlocks(content);
      // Filter out empty files
      const files = Object.fromEntries(
        Object.entries(parsedFiles).filter(
          ([, c]) => typeof c === "string" && c.trim().length > 0
        )
      );

      if (Object.keys(files).length === 0 && !taskSummary) {
        onError?.("No output generated. Please try again.");
        setStatus("ready");
        setFixAttempt(0);
        return;
      }

      onStep?.("Parsing generated files...", true);
      onStep?.("Booting WebContainer...");
      let currentFiles = { ...files };
      let fixAttempt = 0;

      if (Object.keys(currentFiles).length > 0) {
        try {
          const mergedFiles = { ...TEMPLATE_FILES, ...currentFiles };
          const wc = await boot(mergedFiles);
          if (!wc) throw new Error("WebContainer failed to start");
          onStep?.("Booting WebContainer...", true);
          onStep?.("Writing files to sandbox...");
          await runWriteFiles(
            wc,
            Object.entries(currentFiles).map(([path, content]) => ({ path, content })),
            filesRef.current
          );
          onStep?.("Writing files to sandbox...", true);

          const originalRequest = lastMsg.content || "";
          let lastError = "";

          // Loop: verify build (and runtime errors from terminal), retry with AI fixes until success or max retries
          while (fixAttempt < MAX_FIX_RETRIES) {
            onStep?.(`Running build${fixAttempt > 0 ? ` (fix attempt ${fixAttempt})` : ""}...`);
            const { success, output } = await runBuildAndCaptureOutput(wc);
            if (success) {
              // Build passed - check terminal for runtime/compile errors (e.g. Module not found from dev server)
              if (getTerminalOutput) {
                await new Promise((r) => setTimeout(r, 4000));
                const terminal = getTerminalOutput();
                const hasError =
                  /Module not found|MODULE_NOT_FOUND|Can't resolve|Error:|Failed to compile/i.test(
                    terminal
                  );
                if (hasError) {
                  lastError = terminal.slice(-4000);
                } else {
                  break;
                }
              } else {
                break;
              }
            } else {
              lastError = output.slice(-4000);
            }

            fixAttempt++;
            setFixAttempt(fixAttempt);
            onStep?.(`Build failed. Requesting fix from AI (attempt ${fixAttempt} of ${MAX_FIX_RETRIES})...`);
            const errorContext = lastError
              ? `\n\nError output:\n${lastError}`
              : "";
            const fixRes = await fetch("/api/agent/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                fixBuild: true,
                messages: [
                  {
                    role: "user",
                    content: `The build or app failed.${errorContext}

Original request: ${originalRequest}

Fix the code. CRITICAL: Create ALL missing files. If app/page.tsx imports from "./components/kanban-board", you MUST create components/kanban-board.tsx with the full implementation. Output the corrected files in the same format.`,
                  },
                ],
              }),
            });
            if (!fixRes.ok) break;
            const { content: fixContent } = (await fixRes.json()) as { content: string };
            onStep?.(`Parsing fix from AI...`);
            const fixedFiles = Object.fromEntries(
              Object.entries(parseFileBlocks(fixContent)).filter(
                ([, c]) => typeof c === "string" && c.trim().length > 0
              )
            );
            if (Object.keys(fixedFiles).length === 0) break;
            currentFiles = { ...currentFiles, ...fixedFiles };
            onStep?.(`Applying fix from AI...`, true);
            onStep?.(`Writing updated files...`);
            await runWriteFiles(
              wc,
              Object.entries(fixedFiles).map(([path, content]) => ({ path, content })),
              filesRef.current
            );
            onStep?.(`Writing updated files...`, true);
          }
          onStep?.("Build passed.", true);
        } catch {
          /* WebContainer may not be ready */
        }
      }

      const finishRes = await fetch("/api/agent/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskSummary, files: currentFiles }),
      });

      if (!finishRes.ok) {
        const err = await finishRes.json().catch(() => ({}));
        onError?.(err?.error ?? "Failed to save result");
        setStatus("ready");
        setFixAttempt(0);
        return;
      }

      onStep?.("Saving to database...", true);
      onSaved?.();
      setStatus("ready");
      setFixAttempt(0);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
      setFixAttempt(0);
      setTimeout(() => setStatus("ready"), 1000);
    }
  }, [projectId, messages, boot, getWebContainerWhenReady, getTerminalOutput, onSaved, onError, onStep]);

  return { status, fixAttempt, runAgent };
}
