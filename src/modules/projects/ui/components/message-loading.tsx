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

interface MessageLoadingProps {
  streamingText?: string;
  statusMessage?: string;
  /** Error state with optional retry */
  error?: { message: string; onRetry?: () => void };
  /** Shown after timeout when thinking takes too long */
  timeoutMessage?: string;
}

export const MessageLoading = ({
  streamingText,
  statusMessage,
  error,
  timeoutMessage,
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
            <ShimmerMessages statusMessage={statusMessage} />
            {timeoutMessage && (
              <p className="text-sm text-muted-foreground">{timeoutMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
