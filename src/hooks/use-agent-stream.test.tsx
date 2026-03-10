import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

const mockSendMessage = vi.fn();
const mockAddToolOutput = vi.fn();
const mockSetMessages = vi.fn();
const mockUseChat = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
}));

import { useAgentStream } from "./use-agent-stream";

// Note: Full hook tests with renderHook require @testing-library/dom.
// Run: npm install -D @testing-library/dom --legacy-peer-deps
// These tests verify useAgentStream integrates correctly with mocked useChat.

describe("useAgentStream", () => {
  const defaultMessages = [
    { id: "1", role: "USER", content: "Build a todo app" },
  ];
  const getWebContainerWhenReady = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      addToolOutput: mockAddToolOutput,
      setMessages: mockSetMessages,
      status: "ready",
    });
  });

  it("useChat is called with transport and messages", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let hookResult: ReturnType<typeof useAgentStream> | null = null;
    function TestComponent() {
      hookResult = useAgentStream({
        projectId: "proj-1",
        messages: defaultMessages,
        getWebContainerWhenReady,
      });
      return null;
    }

    act(() => {
      createRoot(container).render(React.createElement(TestComponent));
    });

    expect(mockUseChat).toHaveBeenCalled();
    const options = mockUseChat.mock.calls[0][0];
    expect(options.transport).toBeDefined();
    expect(options.messages).toEqual(
      defaultMessages.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase(),
        parts: [{ type: "text", text: m.content }],
      }))
    );
    expect(hookResult?.status).toBe("ready");
    expect(typeof hookResult?.runAgent).toBe("function");

    document.body.removeChild(container);
  });

  it("runAgent invokes sendMessage", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let hookResult: ReturnType<typeof useAgentStream> | null = null;
    function TestComponent() {
      hookResult = useAgentStream({
        projectId: "proj-1",
        messages: defaultMessages,
        getWebContainerWhenReady,
      });
      return null;
    }

    act(() => {
      createRoot(container).render(React.createElement(TestComponent));
    });

    act(() => {
      hookResult?.runAgent();
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    document.body.removeChild(container);
  });
});
