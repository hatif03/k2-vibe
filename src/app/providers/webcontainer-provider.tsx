"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WebContainer } from "@webcontainer/api";
import {
  bootWebContainer,
  mountAndStartDevServer,
  mountFilesAndStartDevServer,
} from "@/lib/webcontainer";
import { fixImportPathsInFiles } from "@/lib/fix-import-paths";
import { TEMPLATE_FILES } from "@/lib/template-flatten";

type WebContainerState =
  | { status: "idle" }
  | { status: "booting" }
  | { status: "mounting" }
  | { status: "ready"; instance: WebContainer; previewUrl: string }
  | { status: "error"; error: string };

interface WebContainerContextValue {
  state: WebContainerState;
  boot: (files?: Record<string, string>) => Promise<WebContainer | null>;
  getWebContainerWhenReady: () => Promise<WebContainer>;
  setPreviewUrl: (url: string) => void;
  terminalOutput: string;
}

const WebContainerContext = createContext<WebContainerContextValue | null>(null);

export function useWebContainer() {
  const ctx = useContext(WebContainerContext);
  if (!ctx) {
    throw new Error("useWebContainer must be used within WebContainerProvider");
  }
  return ctx;
}

export function useWebContainerOptional() {
  return useContext(WebContainerContext);
}

interface Props {
  children: ReactNode;
  /** Initial files to mount (e.g. from Fragment). If not provided, uses template. */
  initialFiles?: Record<string, string> | null;
  /** When true, boot immediately (e.g. when we have existing content to show). Otherwise boot on demand. */
  bootOnMount?: boolean;
}

export function WebContainerProvider({
  children,
  initialFiles,
  bootOnMount = false,
}: Props) {
  const [state, setState] = useState<WebContainerState>({ status: "idle" });
  const [terminalOutput, setTerminalOutput] = useState("");
  const bootPromiseRef = useRef<Promise<WebContainer | null> | null>(null);

  const boot = useCallback(async (files?: Record<string, string>) => {
    if (state.status === "ready") {
      return state.instance;
    }
    if (bootPromiseRef.current) {
      return bootPromiseRef.current;
    }

    const rawFiles =
      files ??
      (initialFiles && Object.keys(initialFiles).length > 0 ? initialFiles : undefined);
    const filesToMount =
      rawFiles && Object.keys(rawFiles).length > 0
        ? { ...TEMPLATE_FILES, ...fixImportPathsInFiles(rawFiles) }
        : undefined;

    const promise = (async () => {
      setState({ status: "booting" });
      setTerminalOutput("");
      try {
        const wc = await bootWebContainer();
        setState({ status: "mounting" });

        const mountOptions = {
          onOutput: (data: string) => {
            setTerminalOutput((prev) => prev + data);
          },
        };

        const url =
          filesToMount && Object.keys(filesToMount).length > 0
            ? await mountFilesAndStartDevServer(
                wc,
                filesToMount,
                (_, url) => {
                  setState((s) =>
                    s.status === "ready"
                      ? s
                      : { status: "ready", instance: wc, previewUrl: url }
                  );
                },
                mountOptions
              )
            : await mountAndStartDevServer(
                wc,
                (_, url) => {
                  setState((s) =>
                    s.status === "ready"
                      ? s
                      : { status: "ready", instance: wc, previewUrl: url }
                  );
                },
                mountOptions
              );

        setState({ status: "ready", instance: wc, previewUrl: url });
        return wc;
      } catch (err) {
        setState({
          status: "error",
          error:
            err instanceof Error ? err.message : "Failed to start WebContainer",
        });
        return null;
      } finally {
        bootPromiseRef.current = null;
      }
    })();

    bootPromiseRef.current = promise;
    return promise;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- state.instance excluded to avoid boot thrashing when instance ref changes
  }, [state.status, initialFiles]);

  const instance = state.status === "ready" ? state.instance : null;
  const errorMsg = state.status === "error" ? state.error : null;
  const getWebContainerWhenReady = useCallback(
    async (): Promise<WebContainer> => {
      if (instance) return instance;
      if (errorMsg) throw new Error(errorMsg);
      const wc = await boot();
      if (wc) return wc;
      throw new Error("WebContainer failed to start");
    },
    [instance, errorMsg, boot]
  );

  const setPreviewUrl = useCallback((url: string) => {
    setState((s) => {
      if (s.status === "ready") {
        return { ...s, previewUrl: url };
      }
      return s;
    });
  }, []);

  useEffect(() => {
    if (!bootOnMount) return;
    const files =
      initialFiles && Object.keys(initialFiles).length > 0 ? initialFiles : undefined;
    boot(files);
  }, [bootOnMount, boot, initialFiles]);

  return (
    <WebContainerContext.Provider
      value={{
        state,
        boot,
        getWebContainerWhenReady,
        setPreviewUrl,
        terminalOutput,
      }}
    >
      {children}
    </WebContainerContext.Provider>
  );
}
