"use client";

import { useCallback, useRef, useState } from "react";
import { fixImportPaths } from "@/lib/fix-import-paths";
import { parseFileBlocks } from "@/lib/parse-file-blocks";
import { TEMPLATE_FILES } from "@/lib/template-flatten";
import type { WebContainer } from "@webcontainer/api";

/** No cap: agent keeps fixing until demo runs without errors */
export const MAX_FIX_RETRIES = Number.POSITIVE_INFINITY;

function ensurePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function runWriteFiles(
  wc: WebContainer,
  files: Array<{ path: string; content: string }>,
  accumulatedFiles: Record<string, string>
): Promise<void> {
  for (const { path, content } of files) {
    const fixedContent = fixImportPaths(content);
    const fullPath = ensurePath(path);
    const dir = fullPath.split("/").slice(0, -1).join("/");
    if (dir) {
      try {
        await wc.fs.mkdir(dir, { recursive: true });
      } catch {
        /* dir may exist */
      }
    }
    await wc.fs.writeFile(fullPath, fixedContent);
    accumulatedFiles[path] = fixedContent;
  }
}

const ERROR_PATTERN =
  /Module not found|MODULE_NOT_FOUND|Can't resolve|Failed to compile|Import trace for requested module|\bError:\s+(?!0\b)/i;
const SUCCESS_PATTERN =
  /compiled successfully|Compiled successfully|Ready in|ready - started/i;

/**
 * Trigger dev server compile by fetching the preview URL, then check terminal for errors.
 * Next.js dev server compiles on-demand, so we must request the page to surface compile errors.
 * Only consider the last 6000 chars of terminal output - a successful compile after a fix
 * clears the error; we must not report hasError from stale output.
 */
async function triggerCompileAndCheckErrors(
  getPreviewUrl: (() => string | null) | undefined,
  getTerminalOutput: (() => string) | undefined,
  waitMs: number
): Promise<{ hasError: boolean; output: string }> {
  // Fetch preview URL to trigger dev server compile (Next.js compiles on first request)
  const url = getPreviewUrl?.() ?? null;
  if (url) {
    try {
      await fetch(url, { mode: "no-cors" }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, waitMs));
  const terminal = getTerminalOutput?.() ?? "";
  const tail = terminal.slice(-6000);

  // If terminal shows a successful compile after the last error, we're good
  let lastErrorPos = -1;
  let lastSuccessPos = -1;
  let m: RegExpExecArray | null;
  const errorRe = new RegExp(ERROR_PATTERN.source, "gi");
  while ((m = errorRe.exec(tail)) !== null) lastErrorPos = m.index;
  const successRe = new RegExp(SUCCESS_PATTERN.source, "gi");
  while ((m = successRe.exec(tail)) !== null) lastSuccessPos = m.index;

  const hasError =
    lastErrorPos >= 0 && (lastSuccessPos < 0 || lastErrorPos > lastSuccessPos);

  return { hasError, output: terminal };
}

export interface UseAgentGenerateOptions {
  projectId: string;
  messages: Array<{ id: string; role: string; content: string }>;
  boot: (files?: Record<string, string>) => Promise<WebContainer | null>;
  getWebContainerWhenReady: () => Promise<WebContainer>;
  getTerminalOutput?: () => string;
  /** Preview URL to fetch and trigger dev server compile before checking terminal */
  getPreviewUrl?: () => string | null;
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
  getPreviewUrl,
  onSaved,
  onError,
  onStep,
}: UseAgentGenerateOptions) {
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [fixAttempt, setFixAttempt] = useState(0);
  const filesRef = useRef<Record<string, string>>({});
  const fixInProgressRef = useRef(false);

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

      let fragmentId: string | null = null;
      let finishRes: Response | null = null;

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

          // Save first version immediately so user sees progress; agent will update if fixes are applied
          onStep?.("Saving first version...");
          finishRes = await fetch("/api/agent/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, taskSummary, files: currentFiles }),
          });
          if (finishRes.ok) {
            const finishData = (await finishRes.json()) as { fragmentId?: string };
            fragmentId = finishData.fragmentId ?? null;
            onStep?.("Saving first version...", true);
            onSaved?.();
          }

          const originalRequest = lastMsg.content || "";
          let lastError = "";

          // Loop: keep fixing until demo runs without errors (no retry cap)
          while (true) {
            onStep?.(
              `Checking dev server${fixAttempt > 0 ? ` (fix attempt ${fixAttempt})` : ""}...`
            );
            const { hasError, output } = getTerminalOutput
              ? await triggerCompileAndCheckErrors(
                  getPreviewUrl,
                  getTerminalOutput,
                  6000
                )
              : { hasError: false, output: "" };
            if (!hasError) {
              break;
            }
            lastError = output.slice(-4000);

            fixAttempt++;
            setFixAttempt(fixAttempt);
            onStep?.(`Errors detected. Requesting fix from AI (attempt ${fixAttempt})...`);
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
            // Update saved fragment with fixes so user sees progress
            if (fragmentId) {
              const updateRes = await fetch("/api/agent/fragment-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fragmentId, files: currentFiles }),
              });
              if (updateRes.ok) onSaved?.();
            }
          }
          onStep?.("No errors detected.", true);
        } catch {
          /* WebContainer may not be ready */
        }
      }

      // If we never saved (e.g. first finish failed or no files path), try finish once
      if (!fragmentId && Object.keys(currentFiles).length > 0) {
        finishRes = await fetch("/api/agent/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, taskSummary, files: currentFiles }),
        });
      }

      if (!finishRes?.ok) {
        const err = await finishRes?.json().catch(() => ({}));
        onError?.(err?.error ?? "Failed to save result");
        setStatus("ready");
        setFixAttempt(0);
        return;
      }

      onSaved?.();
      setStatus("ready");
      setFixAttempt(0);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
      setFixAttempt(0);
      setTimeout(() => setStatus("ready"), 1000);
    }
  }, [projectId, messages, boot, getWebContainerWhenReady, getTerminalOutput, getPreviewUrl, onSaved, onError, onStep]);

  /**
   * Run fix loop for an existing fragment when demo has errors.
   * Call when WebContainer is already booted with fragment files.
   */
  const runFixForExistingProject = useCallback(
    async (fragmentId: string, currentFiles: Record<string, string>, lastUserMessage: string) => {
      setStatus((prev) => {
        if (prev !== "ready") return prev;
        return "streaming";
      });
      setFixAttempt(0);
      filesRef.current = { ...currentFiles };

      try {
        const wc = await getWebContainerWhenReady();
        const originalRequest = lastUserMessage || "";
        let fixAttempt = 0;
        let files = { ...currentFiles };

        onStep?.("Checking demo for errors...");

        while (true) {
          onStep?.(
            `Checking dev server${fixAttempt > 0 ? ` (fix attempt ${fixAttempt})` : ""}...`
          );
          const { hasError, output } = getTerminalOutput
            ? await triggerCompileAndCheckErrors(
                getPreviewUrl,
                getTerminalOutput,
                6000
              )
            : { hasError: false, output: "" };
          if (!hasError) {
            onStep?.("Demo running successfully.", true);
            break;
          }
          const lastError = output.slice(-4000);
          fixAttempt++;
          setFixAttempt(fixAttempt);
          onStep?.(`Errors detected. Requesting fix from AI (attempt ${fixAttempt})...`);
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
          files = { ...files, ...fixedFiles };
          filesRef.current = files;
          onStep?.(`Applying fix from AI...`, true);
          onStep?.(`Writing updated files...`);
          await runWriteFiles(
            wc,
            Object.entries(fixedFiles).map(([path, content]) => ({ path, content })),
            filesRef.current
          );
          onStep?.(`Writing updated files...`, true);
          const updateRes = await fetch("/api/agent/fragment-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fragmentId, files }),
          });
          if (updateRes.ok) onSaved?.();
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "An error occurred");
      } finally {
        fixInProgressRef.current = false;
        setStatus("ready");
        setFixAttempt(0);
      }
    },
    [
      projectId,
      getWebContainerWhenReady,
      getTerminalOutput,
      getPreviewUrl,
      onSaved,
      onError,
      onStep,
    ]
  );

  return { status, fixAttempt, runAgent, runFixForExistingProject };
}
