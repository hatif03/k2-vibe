import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConsumeCredits = vi.fn();

vi.mock("@/lib/usage", () => ({
  consumeCredits: (...args: unknown[]) => mockConsumeCredits(...args),
}));

vi.mock("@/lib/k2-think", () => ({
  createK2Think: vi.fn(() => () => ({})),
  K2_THINK_MODEL: "test-model",
}));

import { POST } from "./route";

describe("POST /api/agent/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeCredits.mockResolvedValue({});
  });

  it("returns 400 when projectId is missing", async () => {
    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("projectId");
    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });

  it("returns 400 when messages is missing", async () => {
    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("messages");
    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });

  it("returns 400 when messages is empty", async () => {
    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-123", messages: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });

  it("returns 429 when credits exhausted and no user API key", async () => {
    mockConsumeCredits.mockRejectedValue(new Error("TOO_MANY_REQUESTS"));
    const req = new Request("http://localhost/api/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-123",
        messages: [{ role: "user", content: "build a todo app" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("credits");
    expect(mockConsumeCredits).toHaveBeenCalled();
  });

});
