import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import type { Fragment } from "@prisma/client";

import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { AgentRunner } from "./agent-runner";

interface Props {
  projectId: string;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
};

export const MessagesContainer = ({
  projectId,
  activeFragment,
  setActiveFragment,
}: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);
  const [retryRequested, setRetryRequested] = useState(false);

  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions(
      { projectId },
      { refetchInterval: 2000 }
    )
  );

  const deleteMessage = useMutation(trpc.messages.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }));
      setRetryRequested(true);
    },
  }));

  useEffect(() => {
    const lastAssistantMessage = messages.findLast(
      (message) => message.role === "ASSISTANT"
    );

    if (
      lastAssistantMessage?.fragment &&
      lastAssistantMessage.id !== lastAssistantMessageIdRef.current
    ) {
      setActiveFragment(lastAssistantMessage.fragment);
      lastAssistantMessageIdRef.current = lastAssistantMessage.id;
    }
  }, [messages, setActiveFragment]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages.length]);

  const lastMessage = messages[messages.length - 1];
  const isLastMessageUser = lastMessage?.role === "USER";

  const uiMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));

  const handleRetry = (errorMessageId: string) => {
    deleteMessage.mutate({ id: errorMessageId, projectId });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-2 pr-1">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              id={message.id}
              content={message.content}
              role={message.role}
              fragment={message.fragment}
              createdAt={message.createdAt}
              isActiveFragment={activeFragment?.id === message.fragment?.id}
              onFragmentClick={() => setActiveFragment(message.fragment)}
              type={message.type}
              onRetry={handleRetry}
              isRetrying={deleteMessage.isPending}
            />
          ))}
          {messages.length > 0 && (
            <AgentRunner
              projectId={projectId}
              messages={uiMessages}
              isLastMessageUser={isLastMessageUser}
              retryRequested={retryRequested}
              onRetryComplete={() => setRetryRequested(false)}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="relative p-3 pt-1">
        <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background pointer-events-none" />
        <MessageForm projectId={projectId} />
      </div>
    </div>
  );
};
