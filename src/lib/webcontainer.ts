"use client";

import { WebContainer } from "@webcontainer/api";
import { WEBCONTAINER_TEMPLATE } from "./webcontainer-template";

let instance: WebContainer | null = null;

/**
 * Boot WebContainer (call only once per tab).
 */
export async function bootWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  instance = await WebContainer.boot();
  return instance;
}

/**
 * Get the WebContainer instance (must be booted first).
 */
export function getWebContainer(): WebContainer | null {
  return instance;
}

export interface MountOptions {
  onOutput?: (data: string) => void;
}

/**
 * Mount the Next.js template and start the dev server.
 * Uses next dev (no Turbopack) for WebContainer compatibility.
 */
export async function mountAndStartDevServer(
  wc: WebContainer,
  onServerReady?: (port: number, url: string) => void,
  options?: MountOptions
): Promise<string> {
  await wc.mount(WEBCONTAINER_TEMPLATE);
  const onOutput = options?.onOutput;

  return new Promise((resolve, reject) => {
    const handleServerReady = (port: number, url: string) => {
      onServerReady?.(port, url);
      resolve(url);
    };

    wc.on("server-ready", handleServerReady);

    (async () => {
      try {
        const install = await wc.spawn("npm", ["install"]);
        if (onOutput) {
          const decoder = new TextDecoder();
          install.output.pipeTo(new WritableStream({
            write: (d) => onOutput(typeof d === "string" ? d : decoder.decode(d)),
          }));
        }
        const installExit = await install.exit;
        if (installExit !== 0) {
          reject(new Error(`npm install failed with exit code ${installExit}`));
          return;
        }
        const dev = await wc.spawn("npm", ["run", "dev"]);
        if (onOutput) {
          const decoder = new TextDecoder();
          dev.output.pipeTo(new WritableStream({
            write: (d) => onOutput(typeof d === "string" ? d : decoder.decode(d)),
          }));
        }
      } catch (err) {
        reject(err);
      }
    })();
  });
}

/**
 * Mount a custom file tree (e.g. from Fragment.files) and start dev server.
 */
export async function mountFilesAndStartDevServer(
  wc: WebContainer,
  files: Record<string, string>,
  onServerReady?: (port: number, url: string) => void,
  options?: MountOptions
): Promise<string> {
  const tree = filesToFileSystemTree(files);
  await wc.mount(tree);
  const onOutput = options?.onOutput;

  return new Promise((resolve, reject) => {
    wc.on("server-ready", (port: number, url: string) => {
      onServerReady?.(port, url);
      resolve(url);
    });

    (async () => {
      try {
        const install = await wc.spawn("npm", ["install"]);
        if (onOutput) {
          const decoder = new TextDecoder();
          install.output.pipeTo(new WritableStream({
            write: (d) => onOutput(typeof d === "string" ? d : decoder.decode(d)),
          }));
        }
        const installExit = await install.exit;
        if (installExit !== 0) {
          reject(new Error(`npm install failed with exit code ${installExit}`));
          return;
        }
        const dev = await wc.spawn("npm", ["run", "dev"]);
        if (onOutput) {
          const decoder = new TextDecoder();
          dev.output.pipeTo(new WritableStream({
            write: (d) => onOutput(typeof d === "string" ? d : decoder.decode(d)),
          }));
        }
      } catch (err) {
        reject(err);
      }
    })();
  });
}

/**
 * Convert flat file record (path -> content) to FileSystemTree.
 */
function filesToFileSystemTree(files: Record<string, string>): import("@webcontainer/api").FileSystemTree {
  const tree: Record<string, { directory?: Record<string, unknown>; file?: { contents: string } }> = {};

  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || !("directory" in current[part]!)) {
        current[part] = { directory: {} };
      }
      current = current[part]!.directory as Record<string, { directory?: Record<string, unknown>; file?: { contents: string } }>;
    }

    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
  }

  return tree as import("@webcontainer/api").FileSystemTree;
}
