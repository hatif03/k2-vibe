import type { FileSystemTree } from "@webcontainer/api";
import { WEBCONTAINER_TEMPLATE } from "./webcontainer-template";

/**
 * Flatten a FileSystemTree to Record<path, content>.
 * Used to merge the base template with agent-generated files.
 */
export function flattenFileSystemTree(
  tree: FileSystemTree,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [name, entry] of Object.entries(tree)) {
    const path = prefix ? `${prefix}/${name}` : name;

    if (entry && "file" in entry && entry.file && "contents" in entry.file) {
      const contents = entry.file.contents;
      result[path] = typeof contents === "string" ? contents : new TextDecoder().decode(contents);
    } else if (entry && "directory" in entry && entry.directory) {
      Object.assign(
        result,
        flattenFileSystemTree(entry.directory as FileSystemTree, path)
      );
    }
  }

  return result;
}

/** Flattened template files for client-side merge with generated code. */
export const TEMPLATE_FILES = flattenFileSystemTree(WEBCONTAINER_TEMPLATE);
