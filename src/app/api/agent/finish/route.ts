import { auth } from "@clerk/nextjs/server";
import { FRAGMENT_TITLE_PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { stripK2Thinking } from "@/lib/strip-k2-thinking";
import { prisma } from "@/lib/db";
import { getUserApiKey } from "@/lib/usage";
import { flattenFileSystemTree } from "@/lib/template-flatten";
import { WEBCONTAINER_TEMPLATE } from "@/lib/webcontainer-template";

export const maxDuration = 30;

async function callK2Chat(
  apiKey: string,
  system: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://api.k2think.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "MBZUAI-IFM/K2-Think-v2",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    throw new Error(`K2 API error: ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  return stripK2Thinking(raw);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const { projectId, taskSummary, files } = body as {
    projectId: string;
    taskSummary: string;
    files: Record<string, string>;
  };

  if (!projectId || !taskSummary) {
    return new Response(
      JSON.stringify({ error: "projectId and taskSummary required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) {
    return new Response(
      JSON.stringify({ error: "Project not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = (await getUserApiKey()) ?? process.env.K2_THINK_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "K2 Think API key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const wrappedSummary = `<task_summary>\n${taskSummary}\n</task_summary>`;

  let title = "Fragment";
  let content = "Here's what I built for you.";

  try {
    const [titleText, responseText] = await Promise.all([
      callK2Chat(apiKey, FRAGMENT_TITLE_PROMPT, wrappedSummary, 50),
      callK2Chat(apiKey, RESPONSE_PROMPT, wrappedSummary, 200),
    ]);
    if (titleText) title = titleText;
    if (responseText) content = responseText;
  } catch (err) {
    console.error("[agent/finish] K2 API error:", err);
    // Continue with fallback title/content
  }

  // Filter out empty or whitespace-only files
  const validFiles = Object.fromEntries(
    Object.entries(files ?? {}).filter(
      ([, content]) => typeof content === "string" && content.trim().length > 0
    )
  );

  // Merge template + generated files so the sandbox has a complete runnable project
  const templateFlat = flattenFileSystemTree(WEBCONTAINER_TEMPLATE);
  const mergedFiles = { ...templateFlat, ...validFiles };

  const isError = Object.keys(validFiles).length === 0;

  if (isError) {
    await prisma.message.create({
      data: {
        projectId,
        content: "Something went wrong. Please try again.",
        role: "ASSISTANT",
        type: "ERROR",
      },
    });
  } else {
    const message = await prisma.message.create({
      data: {
        projectId,
        content,
        role: "ASSISTANT",
        type: "RESULT",
        fragment: {
          create: {
            sandboxUrl: "",
            title,
            files: mergedFiles,
          },
        },
      },
      include: { fragment: true },
    });
    return new Response(
      JSON.stringify({ ok: true, fragmentId: message.fragment?.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
