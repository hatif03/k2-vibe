import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { createK2Think, K2_THINK_MODEL } from "@/lib/k2-think";
import { FRAGMENT_TITLE_PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";

export const maxDuration = 30;

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

  const provider = createK2Think();
  const model = provider(K2_THINK_MODEL);

  const wrappedSummary = `<task_summary>\n${taskSummary}\n</task_summary>`;

  const [titleResult, responseResult] = await Promise.all([
    generateText({
      model,
      system: FRAGMENT_TITLE_PROMPT,
      prompt: wrappedSummary,
      maxOutputTokens: 50,
    }),
    generateText({
      model,
      system: RESPONSE_PROMPT,
      prompt: wrappedSummary,
      maxOutputTokens: 200,
    }),
  ]);

  const title = titleResult.text.trim() || "Fragment";
  const content = responseResult.text.trim() || "Here's what I built for you.";

  const isError = Object.keys(files ?? {}).length === 0;

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
    await prisma.message.create({
      data: {
        projectId,
        content,
        role: "ASSISTANT",
        type: "RESULT",
        fragment: {
          create: {
            sandboxUrl: "",
            title,
            files: files ?? {},
          },
        },
      },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
