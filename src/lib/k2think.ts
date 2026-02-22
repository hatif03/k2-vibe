import { openai } from "@inngest/agent-kit";

/**
 * K2 Think V2 model from MBZUAI.
 * Uses OpenAI-compatible API at api.k2think.ai
 */
export const k2Think = () =>
  openai({
    model: "MBZUAI-IFM/K2-Think-v2",
    apiKey: process.env.K2_THINK_API_KEY,
    baseUrl: "https://api.k2think.ai/v1",
    defaultParameters: {
      temperature: 0.1,
    },
  });
