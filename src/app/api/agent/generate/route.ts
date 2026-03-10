/**
 * Non-streaming K2 Think API route.
 * Bypasses AI SDK streaming for maximum compatibility with K2 Think.
 * Uses direct fetch to api.k2think.ai/v1/chat/completions.
 */
import { NextResponse } from "next/server";
import { consumeCredits } from "@/lib/usage";
import { stripK2Thinking } from "@/lib/strip-k2-thinking";
import { PROMPT_FIX_BUILD, PROMPT_SINGLE_SHOT } from "@/prompt";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, projectId, fixBuild } = body as {
    messages: Array<{ role: string; content?: string; parts?: Array<{ type: string; text?: string }> }>;
    projectId: string;
    fixBuild?: boolean;
  };

  if (!projectId || !messages?.length) {
    return NextResponse.json(
      { error: "projectId and messages required" },
      { status: 400 }
    );
  }

  let userApiKey: string | undefined;
  try {
    const credits = await consumeCredits();
    userApiKey = credits.userApiKey;
  } catch (err) {
    if (err instanceof Error && err.message === "TOO_MANY_REQUESTS") {
      return NextResponse.json(
        { error: "You have run out of credits. Add your API key in settings." },
        { status: 429 }
      );
    }
    throw err;
  }

  const apiKey = userApiKey ?? process.env.K2_THINK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "K2 Think API key not configured" },
      { status: 500 }
    );
  }

  const k2Messages = messages.map((m) => ({
    role: m.role.toLowerCase() as "user" | "assistant" | "system",
    content:
      m.content ??
      m.parts?.map((p) => ("text" in p ? p.text : "")).join("") ??
      "",
  }));

  const systemPrompt = fixBuild ? PROMPT_FIX_BUILD : PROMPT_SINGLE_SHOT;

  const response = await fetch("https://api.k2think.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "MBZUAI-IFM/K2-Think-v2",
      messages: [
        { role: "system", content: systemPrompt },
        ...k2Messages,
      ],
      max_tokens: 32768,
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[agent/generate] K2 API error", response.status, errText);
    return NextResponse.json(
      { error: `K2 Think API error: ${response.status}` },
      { status: response.status }
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const content = stripK2Thinking(raw);

  if (process.env.NODE_ENV === "development" && content) {
    console.log(
      "[agent/generate] K2 response length:",
      content.length,
      "snippet:",
      content.slice(0, 200).replace(/\n/g, " ")
    );
  }

  return NextResponse.json({ content });
}
