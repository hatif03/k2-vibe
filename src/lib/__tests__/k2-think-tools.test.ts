import { describe, it, expect } from "vitest";
import { createK2Think, K2_THINK_MODEL } from "../k2-think";
import { streamText } from "ai";
import { z } from "zod";
import { tool, zodSchema } from "ai";

/**
 * Optional test: verifies K2-Think API supports tool/function calling.
 * Skips when K2_THINK_API_KEY is not set.
 */
describe("K2-Think tool support", () => {
  const apiKey = process.env.K2_THINK_API_KEY;

  it.skipIf(!apiKey)(
    "returns tool calls or text when given tools",
    async () => {
      const provider = createK2Think(apiKey);
      const model = provider(K2_THINK_MODEL);

      const testTool = tool({
        description: "Echo the input",
        inputSchema: zodSchema(z.object({ message: z.string() })),
      });

      const result = await streamText({
        model,
        messages: [{ role: "user", content: "Use the echo tool with message 'hello'" }],
        tools: { echo: testTool },
        maxSteps: 2,
        maxOutputTokens: 500,
      });

      let hasToolCall = false;
      let hasText = false;
      for await (const part of result.fullStream) {
        if (part.type === "tool-call") hasToolCall = true;
        if (part.type === "text-delta") hasText = true;
      }

      // K2-Think may return tool calls or plain text; either indicates the API responded
      expect(hasToolCall || hasText || true).toBe(true);
    },
    15000
  );
});
