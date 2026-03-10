import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConsumeCredits = vi.fn();

vi.mock("@/lib/usage", () => ({
  consumeCredits: (...args: unknown[]) => mockConsumeCredits(...args),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { POST } from "./route";

describe("POST /api/agent/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.K2_THINK_API_KEY = "test-key";
    mockConsumeCredits.mockResolvedValue({});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "test" } }] }),
    });
  });

  it("returns 400 when projectId missing", async () => {
    const req = new Request("http://localhost/api/agent/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 429 when credits exhausted", async () => {
    mockConsumeCredits.mockRejectedValue(new Error("TOO_MANY_REQUESTS"));
    const req = new Request("http://localhost/api/agent/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        messages: [{ role: "user", content: "build app" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("calls K2 API and returns content", async () => {
    const req = new Request("http://localhost/api/agent/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        messages: [{ role: "user", content: "build a todo app" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.k2think.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: expect.stringContaining("Bearer"),
        }),
      })
    );
    const json = await res.json();
    expect(json.content).toBe("test");
  });
});
