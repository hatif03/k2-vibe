import Image from "next/image";
import { useState, useEffect } from "react";

const SHIMMER_MESSAGES = [
  "Thinking...",
  "Loading...",
  "Generating...",
  "Analyzing your request...",
  "Building your website...",
  "Crafting components...",
  "Optimizing layout...",
  "Adding final touches...",
  "Almost ready...",
];

const ShimmerMessages = ({
  statusMessage,
}: {
  statusMessage?: string;
}) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % SHIMMER_MESSAGES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="text-base text-muted-foreground animate-pulse">
        {statusMessage ?? SHIMMER_MESSAGES[currentMessageIndex]}
      </span>
    </div>
  );
};

export interface AgentStep {
  id: string;
  message: string;
  done?: boolean;
}

interface MessageLoadingProps {
  streamingText?: string;
  statusMessage?: string;
  /** Error state with optional retry */
  error?: { message: string; onRetry?: () => void };
  /** Shown after timeout when thinking takes too long */
  timeoutMessage?: string;
  /** Agent steps/calls to display */
  steps?: AgentStep[];
}

export const MessageLoading = ({
  streamingText,
  statusMessage,
  error,
  timeoutMessage,
  steps = [],
}: MessageLoadingProps) => {
  return (
    <div className="flex flex-col group px-2 pb-4">
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image
          src="/logo.svg"
          alt="K2 Vibe"
          width={18}
          height={18}
          className="shrink-0"
        />
        <span className="text-sm font-medium">K2 Vibe</span>
      </div>
      <div className="pl-8.5 flex flex-col gap-y-4">
        {error ? (
          <div className="flex flex-col gap-2">
            <p className="text-base text-destructive">{error.message}</p>
            {error.onRetry && (
              <button
                type="button"
                onClick={error.onRetry}
                className="text-sm text-primary hover:underline w-fit"
              >
                Retry
              </button>
            )}
          </div>
        ) : streamingText ? (
          <p className="text-base text-muted-foreground">{streamingText}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {steps.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {steps.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="shrink-0 mt-0.5">
                      {s.done ? "✓" : "○"}
                    </span>
                    <span className={s.done ? "" : "animate-pulse"}>
                      {s.message}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <ShimmerMessages statusMessage={statusMessage} />
            )}
            {timeoutMessage && (
              <p className="text-sm text-muted-foreground">{timeoutMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
