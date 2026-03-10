/**
 * Fix broken import paths that cause "Import trace for requested module" in WebContainer.
 * From app/page.tsx, "./components/foo" resolves to app/components/foo (wrong).
 * Components live at project root components/, so use "@/components/foo" instead.
 * Note: "../components/" from app/ is correct; only "./components/" is wrong.
 */
export function fixImportPaths(content: string): string {
  return content
    .replace(/from\s+["']\.\/components\//g, 'from "@/components/')
    .replace(/import\s+\(["']\.\/components\//g, 'import("@/components/');
}

/** Apply fixImportPaths to all file contents in a record. */
export function fixImportPathsInFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    result[path] = fixImportPaths(content);
  }
  return result;
}
