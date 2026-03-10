/**
 * Strip K2 Think model's internal reasoning/thinking from responses.
 * K2 Think outputs chain-of-thought before the final answer; we keep only the answer.
 */
export function stripK2Thinking(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text.trim();

  // 1. Extract <answer>...</answer> if present (K2 Think format)
  const answerMatch = result.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (answerMatch) {
    return answerMatch[1].trim();
  }

  // 2. Strip <think>...</think> blocks
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 3. Take content after "Thus final answer:" or "Final answer:"
  const finalAnswerIdx = result.search(/(?:Thus\s+)?final\s+answer:\s*/i);
  if (finalAnswerIdx >= 0) {
    let afterMarker = result.slice(finalAnswerIdx).replace(
      /^(?:Thus\s+)?final\s+answer:\s*/i,
      ""
    ).trim();
    // Drop meta lines like "plain text, no tags." at the start
    afterMarker = afterMarker.replace(
      /^(?:plain\s+text,?\s*no\s+tags\.?|no\s+tags\.?)\s*\n?/i,
      ""
    ).trim();
    if (afterMarker) return afterMarker;
  }

  return result.trim() || text.trim();
}
