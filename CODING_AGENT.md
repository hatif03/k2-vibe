# K2 Vibe Coding Agent

This document describes the problems encountered while building the AI coding agent, the fixes applied, and the rationale behind the current architecture.

---

## Problems Encountered

### 1. Import Path Errors (`./app/page.tsx` / "Import trace for requested module")

**Problem:** Generated apps frequently failed to build with errors like:
```
Error: ./app/page.tsx
Import trace for requested module: ./app/page.tsx
```

**Root cause:** In Next.js, imports are resolved relative to the importing file. From `app/page.tsx`, the path `./components/counter` resolves to `app/components/counter`, not the project root `components/counter`. The agent often generated `import X from "./components/foo"` when the file actually lived at `components/foo.tsx`.

---

### 2. Agent Fix Loop Never Stopping

**Problem:** The agent kept retrying fixes indefinitely (attempt 7, 11, 12...) even after the build succeeded.

**Root cause:** Terminal output is cumulative. The error-detection regex matched against the *entire* terminal buffer. After a successful fix and recompile, old error messages ("Error:", "Import trace", etc.) remained in the buffer, so the agent kept thinking there were still errors.

---

### 3. Auto-Fix Triggering Unwanted Runs

**Problem:** When opening an existing project with errors, the agent auto-started the fix loop. Users wanted control: fix only when they explicitly request it.

**Root cause:** An effect in `AgentRunner` ran 3 seconds after loading a project with errors and automatically called `runFixForExistingProject`.

---

### 4. Parsing Code as File Paths

**Problem:** The file-block parser sometimes treated code lines (e.g. `import X from "./foo"`) as file paths, creating invalid files.

**Root cause:** Markdown code blocks use the first line as a path hint. Without validation, lines like `import { Button } from "@/components/ui/button"` were accepted as paths.

---

### 5. Hydration Mismatch (Clerk UserButton)

**Problem:** Server/client HTML mismatch when rendering Clerk's `UserButton` with theme-dependent styling.

**Root cause:** `UserButton` and `useCurrentTheme` render differently on server vs client, causing React hydration errors.

---

### 6. Model Thinking Exposed in Chat

**Problem:** K2 Think outputs internal reasoning (`</think>` blocks, "Thus final answer:") which appeared in the chat UI.

**Root cause:** The model returns chain-of-thought before the final answer; the raw response was displayed without stripping internal reasoning.

---

### 7. Retry Limit Too Low

**Problem:** A 6-retry cap caused the agent to give up before fixing all errors.

**Root cause:** Hard-coded retry limit in the fix loop.

---

### 8. Delayed Save / No Early Progress

**Problem:** Users didn't see saved progress until the entire fix loop completed.

**Root cause:** The finish/save API was only called after all fixes were applied.

---

### 9. WebContainer Boot Missing Base Files

**Problem:** Booting the WebContainer with only fragment files could miss base template files (layout, globals.css, tsconfig, etc.).

**Root cause:** Fragment files were mounted without merging with `TEMPLATE_FILES`.

---

### 10. WebAssembly Out of Memory

**Problem:** Running `npm run build` in the WebContainer could trigger "Out of memory" errors.

**Root cause:** Production builds are heavier; the dev server is sufficient for error checking.

---

### 11. React Effect Infinite Loops

**Problem:** `useEffect` dependency arrays changing size between renders ("dependency array changed size"), or effects re-running indefinitely due to `setState` / `status` in deps.

**Root cause:** Unstable dependencies (e.g. `runFixForExistingProject`, `status`) caused effect thrashing.

---

### 12. Agent Status Not Visible

**Problem:** Users couldn't see when the agent was fixing or what step it was on.

**Root cause:** No UI for agent status, fix attempt count, or step-by-step progress.

---

## Fixes Applied

### 1. Import Path Correction

**Location:** `src/lib/fix-import-paths.ts`, `src/hooks/use-agent-stream.ts`, `src/hooks/use-agent-generate.ts`, `src/app/providers/webcontainer-provider.tsx`

**Fix:**
- `fixImportPaths(content)` rewrites `from "./components/..."` → `from "@/components/..."`
- Applied in `runWriteFiles` before writing to the WebContainer
- Applied in `webcontainer-provider` when merging files for initial mount (`fixImportPathsInFiles`)

**Why:** The agent sometimes outputs wrong imports. Post-processing ensures correct paths regardless of model output. The `@/` alias resolves to project root via `tsconfig.json` paths.

---

### 2. Smarter Error Detection

**Location:** `src/hooks/use-agent-generate.ts` — `triggerCompileAndCheckErrors`

**Fix:**
- Only consider the last 6000 characters of terminal output
- Track last position of error pattern vs. success pattern
- `hasError = true` only if the last error appears *after* the last success
- Success patterns: `compiled successfully`, `Compiled successfully`, `Ready in`, `ready - started`

**Why:** After a successful fix, Next.js prints "compiled successfully" at the end. If that appears after the last "Error:", we know the build is OK. Stale errors in the buffer no longer trigger false positives.

---

### 3. Remove Auto-Fix on Project Load

**Location:** `src/modules/projects/ui/components/agent-runner.tsx`

**Fix:** Removed the effect that auto-triggered `runFixForExistingProject` 3 seconds after loading a project with errors.

**Why:** Users want manual control. The "Fix errors automatically" button in the Terminal panel is the only way to trigger fixes for existing projects.

---

### 4. File Path Validation in Parser

**Location:** `src/lib/parse-file-blocks.ts` — `isValidFilePath`

**Fix:**
- Path must match `^[\w./-]+\.(tsx?|jsx?|css|json|md)$/i`
- Reject lines containing: `import`, `from `, `export `, `require(`, `;`, `"`, `'`, `{`, `}`, `@type`, `**`

**Why:** Prevents code fragments from being parsed as file paths.

---

### 5. Hydration-Safe UserButton

**Location:** `src/components/user-control.tsx`

**Fix:** Render `UserButton` only after mount (`useEffect` sets `mounted = true`). Before mount, render a placeholder div with the same dimensions.

**Why:** Avoids server/client mismatch; Clerk components are client-only.

---

### 6. Strip K2 Think Internal Reasoning

**Location:** `src/lib/strip-k2-thinking.ts`, `src/app/api/agent/generate/route.ts`, `src/app/api/agent/finish/route.ts`

**Fix:**
- Extract `<answer>...</answer>` if present
- Strip `<think>...</think>` blocks
- Take content after "Thus final answer:" or "Final answer:"

**Why:** Chat should show only the final answer, not internal reasoning.

---

### 7. Unlimited Fix Retries

**Location:** `src/hooks/use-agent-generate.ts` — `MAX_FIX_RETRIES = Number.POSITIVE_INFINITY`

**Fix:** Removed the retry cap; the agent keeps fixing until `hasError` is false.

**Why:** With correct error detection, the loop stops when the build succeeds. No artificial limit.

---

### 8. Save First Version Early

**Location:** `src/hooks/use-agent-generate.ts` — `runAgent`

**Fix:** Call `/api/agent/finish` immediately after writing the first set of files, before the fix loop. Update the fragment via `/api/agent/fragment-update` after each fix.

**Why:** Users see progress right away; fixes update the saved fragment incrementally.

---

### 9. Merge Template on WebContainer Boot

**Location:** `src/app/providers/webcontainer-provider.tsx`, `src/lib/template-flatten.ts`

**Fix:** When booting with fragment files, merge `TEMPLATE_FILES` with fragment files: `{ ...TEMPLATE_FILES, ...fixImportPathsInFiles(rawFiles) }`.

**Why:** Ensures base Next.js setup (layout, globals.css, tsconfig, components/ui, lib/utils) is always present.

---

### 10. Use Dev Server for Error Checking

**Location:** `src/hooks/use-agent-generate.ts` — `triggerCompileAndCheckErrors`

**Fix:** Trigger compile by fetching the preview URL; check terminal output. Do not run `npm run build`.

**Why:** Avoids WebAssembly OOM; dev server compiles on-demand and surfaces errors.

---

### 11. Stable Effect Dependencies

**Location:** `src/modules/projects/ui/components/agent-runner.tsx`

**Fix:** Use `triggerFixRef` for the fix callback; keep `setTriggerFix` deps stable (`[hasFragment, activeFragment?.id ?? null, setTriggerFix]`). Avoid `status` or `runFixForExistingProject` in effect deps.

**Why:** Prevents "dependency array changed size" and infinite re-runs.

---

### 12. Agent Status UI

**Location:** `src/app/providers/agent-status-provider.tsx`, `src/modules/projects/ui/views/project-view.tsx`, `src/modules/projects/ui/components/message-loading.tsx`

**Fix:**
- `AgentStatusProvider` exposes `status`, `fixAttempt`, `steps`, `addStep`, `clearSteps`, `triggerFix`
- `AgentStatusBanner` shows "Agent is fixing issues (attempt N)" or "Agent is building..."
- `MessageLoading` displays steps with ✓/○ indicators

**Why:** Users see what the agent is doing and when it's retrying.

---

### 13. Prompt Updates for Import Paths

**Location:** `src/prompt.ts` — `PROMPT_SINGLE_SHOT`, `PROMPT_FIX_BUILD`

**Fix:** Explicit instructions:
- From `app/page.tsx`: use `./name` for files in `app/`; use `@/components/name` for files in `components/`
- NEVER use `./components/...` from `app/page.tsx` — it resolves to `app/components/` which does not exist

**Why:** Reduces wrong imports at the source; `fixImportPaths` is a safety net.

---

### 14. Error Pattern for "Import trace"

**Location:** `src/app/providers/agent-status-provider.tsx` — `HAS_ERROR_PATTERN`

**Fix:** Added `Import trace for requested module` to the regex so the "Fix errors automatically" button appears when this error is in the terminal.

**Why:** Ensures the fix flow is triggered for this specific error type.

---

## Current Solution Architecture

### Flow Overview

1. **User sends message** → `AgentRunner` runs `runAgent`
2. **Generate** → Call `/api/agent/generate` (K2 Think single-shot)
3. **Parse** → `parseFileBlocks` extracts `<file path="...">...</file>` blocks; `isValidFilePath` filters invalid paths
4. **Boot WebContainer** → Merge `TEMPLATE_FILES` with parsed files; apply `fixImportPathsInFiles`; mount and start dev server
5. **Write files** → `runWriteFiles` applies `fixImportPaths` to each file before writing
6. **Save first version** → POST to `/api/agent/finish`; user sees progress
7. **Fix loop** → `triggerCompileAndCheckErrors` fetches preview URL, waits, checks last 6000 chars of terminal; if `hasError`, call generate with `fixBuild: true`; repeat until no errors
8. **Manual fix** → User clicks "Fix errors automatically" in Terminal when opening a project with errors

### Key Files

| File | Role |
|------|------|
| `src/hooks/use-agent-generate.ts` | Main agent logic: generate, fix loop, `triggerCompileAndCheckErrors`, `runWriteFiles` |
| `src/lib/fix-import-paths.ts` | Rewrite `./components/` → `@/components/` in file content |
| `src/lib/parse-file-blocks.ts` | Parse file blocks; `isValidFilePath` rejects code-like paths |
| `src/app/providers/webcontainer-provider.tsx` | Boot WebContainer; merge template + fragment; apply `fixImportPathsInFiles` |
| `src/app/providers/agent-status-provider.tsx` | Status context, steps, `triggerFix`, `HAS_ERROR_PATTERN` |
| `src/modules/projects/ui/components/agent-runner.tsx` | Orchestrates generate/fix; registers `triggerFix` for manual button |
| `src/modules/projects/ui/components/terminal-panel.tsx` | "Fix errors automatically" button when `hasErrors && triggerFix && status === "ready"` |
| `src/prompt.ts` | `PROMPT_SINGLE_SHOT`, `PROMPT_FIX_BUILD` with import path rules |

### Design Principles

1. **Defense in depth:** Prompts guide correct imports; `fixImportPaths` corrects mistakes.
2. **User control:** No auto-fix; user triggers fixes via the Terminal button.
3. **Accurate stop condition:** Compare last error vs. last success in terminal tail; stop when build succeeds.
4. **Early feedback:** Save first version before fix loop; update fragment after each fix.
5. **Stable effects:** Avoid dependency churn; use refs for callbacks where needed.
