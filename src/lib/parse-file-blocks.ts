/**
 * Parse single-shot output format from K2 Think.
 * Supports multiple formats:
 * 1. <file path="...">content</file> (primary)
 * 2. <file path='...'>content</file> (single quotes)
 * 3. ```path\ncontent\n``` or ```tsx\npath\ncontent\n``` (markdown fallback)
 */
export function parseFileBlocks(text: string): Record<string, string> {
  const files: Record<string, string> = {};

  // 1. XML-style with double quotes
  const xmlDouble = /<file\s+path="([^"]+)">\s*([\s\S]*?)<\/file>/gi;
  addMatches(files, text, xmlDouble);

  // 2. XML-style with single quotes (if nothing found yet for a path)
  const xmlSingle = /<file\s+path='([^']+)'>\s*([\s\S]*?)<\/file>/gi;
  addMatches(files, text, xmlSingle);

  // 3. Markdown code blocks: ```path\ncontent``` or ```tsx\npath\ncontent```
  // Only accept lines that look like real file paths (reject code fragments like "import X from ...")
  const mdBlock = /```(?:\w+\s*\n)?([^\n]+)\n([\s\S]*?)```/g;
  let mdMatch;
  while ((mdMatch = mdBlock.exec(text)) !== null) {
    const pathLine = mdMatch[1].trim();
    const content = mdMatch[2].trim();
    const path = pathLine.startsWith("path:")
      ? pathLine.slice(5).trim()
      : pathLine;
    if (path && content && isValidFilePath(path)) {
      const normalized = path.replace(/^\.\//, "");
      if (!files[normalized] || files[normalized].length < content.length) {
        files[normalized] = content;
      }
    }
  }

  return files;
}

/** Reject code fragments mistaken for paths (e.g. "import X from ...", "** @type") */
function isValidFilePath(path: string): boolean {
  const normalized = path.replace(/^\.\//, "");
  // Must look like a path: only alphanumeric, /, ., -, _
  if (!/^[\w./-]+\.(tsx?|jsx?|css|json|md)$/i.test(normalized)) return false;
  // Reject code-like patterns
  const lower = path.toLowerCase();
  if (
    lower.includes("import") ||
    lower.includes("from ") ||
    lower.includes("export ") ||
    lower.includes("require(") ||
    path.includes(";") ||
    path.includes('"') ||
    path.includes("'") ||
    path.includes("{") ||
    path.includes("}") ||
    path.includes("@type") ||
    path.includes("**")
  )
    return false;
  return true;
}

function addMatches(
  files: Record<string, string>,
  text: string,
  regex: RegExp
): void {
  let match;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim().replace(/^\.\//, "");
    const content = match[2].trim();
    if (path && content) {
      files[path] = content;
    }
  }
}
