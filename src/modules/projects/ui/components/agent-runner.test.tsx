import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const mockRunAgent = vi.fn();
const mockUseAgentStream = vi.fn(() => ({
  status: "ready",
  runAgent: mockRunAgent,
}));

const mockWc = {
  state: { status: "ready" as const },
  boot: vi.fn(),
  getWebContainerWhenReady: vi.fn(() => Promise.resolve({})),
};

const mockUseWebContainerOptional = vi.fn(() => mockWc);

vi.mock("@/hooks/use-agent-generate", () => ({
  useAgentGenerate: (...args: unknown[]) => mockUseAgentStream(...args),
}));

vi.mock("@/app/providers/webcontainer-provider", () => ({
  useWebContainerOptional: () => mockUseWebContainerOptional(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    messages: { getMany: { queryOptions: vi.fn() } },
    usage: { status: { queryOptions: vi.fn() } },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) =>
    React.createElement("img", { alt: props.alt, "data-testid": "next-image" }),
}));

import { AgentRunner } from "./agent-runner";

function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(ui);
  return { container, root };
}

function flushAndRender(ui: React.ReactElement) {
  const { container, root } = render(ui);
  act(() => {
    root.render(ui);
  });
  return { container, root };
}

describe("AgentRunner", () => {
  const defaultProps = {
    projectId: "proj-1",
    messages: [{ id: "1", role: "USER", content: "Build a todo app" }],
    isLastMessageUser: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgentStream.mockReturnValue({
      status: "ready",
      runAgent: mockRunAgent,
    });
    mockUseWebContainerOptional.mockReturnValue({
      ...mockWc,
      state: { status: "ready" },
    });
  });

  it("returns null when isLastMessageUser is false", () => {
    const { container } = render(
      React.createElement(AgentRunner, {
        ...defaultProps,
        isLastMessageUser: false,
      })
    );
    expect(container.textContent).toBe("");
  });

  it("shows Thinking when status is ready and wc exists", () => {
    const { container } = flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(container.textContent).toMatch(/Thinking|K2 Vibe/);
  });

  it("shows Building when status is streaming", () => {
    mockUseAgentStream.mockReturnValue({
      status: "streaming",
      runAgent: mockRunAgent,
    });
    const { container } = flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(container.textContent).toMatch(/Building|K2 Vibe/);
  });

  it("shows Building when status is submitted", () => {
    mockUseAgentStream.mockReturnValue({
      status: "submitted",
      runAgent: mockRunAgent,
    });
    const { container } = flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(container.textContent).toMatch(/Building|K2 Vibe/);
  });

  it("shows Starting environment when wc is booting", () => {
    mockUseWebContainerOptional.mockReturnValue({
      ...mockWc,
      state: { status: "booting" },
    });
    const { container } = flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(container.textContent).toMatch(/Starting environment|K2 Vibe/);
  });

  it("shows error UI when wc state is error", () => {
    mockUseWebContainerOptional.mockReturnValue({
      ...mockWc,
      state: { status: "error" },
      boot: vi.fn(),
    });
    const { container } = flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(container.textContent).toMatch(/Preview environment|Retry|Chrome|Edge/);
  });

  it("calls runAgent when last message is USER and conditions met", () => {
    flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(mockRunAgent).toHaveBeenCalled();
  });

  it("renders when wc is null and isLastMessageUser", () => {
    mockUseWebContainerOptional.mockReturnValue(null);
    const { container } = flushAndRender(React.createElement(AgentRunner, defaultProps));
    expect(container.textContent).toBeTruthy();
  });
});
