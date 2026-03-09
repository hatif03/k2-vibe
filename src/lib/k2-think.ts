import { createOpenAI } from "@ai-sdk/openai";

/**
 * K2-Think model provider (OpenAI-compatible API).
 * Uses MBZUAI-IFM/K2-Think-v2 via api.k2think.ai
 */
export function createK2Think(apiKey?: string) {
  return createOpenAI({
    baseURL: "https://api.k2think.ai/v1",
    apiKey: apiKey ?? process.env.K2_THINK_API_KEY,
  });
}

export const K2_THINK_MODEL = "MBZUAI-IFM/K2-Think-v2";
