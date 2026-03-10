import { z } from "zod";
import {
  streamText,
  tool,
  zodSchema,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createK2Think, K2_THINK_MODEL } from "@/lib/k2-think";
import { PROMPT, PROMPT_SINGLE_SHOT } from "@/prompt";
import { consumeCredits } from "@/lib/usage";

const agentTools = {
  terminal: tool({
    description: "Run a command in the terminal. Use for npm install, etc.",
    inputSchema: zodSchema(
      z.object({
        command: z.string().describe("The shell command to run"),
      })
    ),
  }),
  writeFiles: tool({
    description:
      "Create or update files in the project. Use relative paths like app/page.tsx",
    inputSchema: zodSchema(
      z.object({
        files: z.array(
          z.object({
            path: z.string().describe("Relative file path"),
            content: z.string().describe("File content"),
          })
        ),
      })
    ),
  }),
  readFiles: tool({
    description:
      "Read file contents. Use paths like app/page.tsx or components/ui/button.tsx",
    inputSchema: zodSchema(
      z.object({
        files: z.array(z.string()).describe("Paths to files to read"),
      })
    ),
  }),
  listDir: tool({
    description: "List directory contents. Use path like app or components/ui",
    inputSchema: zodSchema(
      z.object({
        path: z.string().describe("Directory path to list"),
      })
    ),
  }),
  searchFiles: tool({
    description: "Search for text pattern in files. Returns matching lines.",
    inputSchema: zodSchema(
      z.object({
        pattern: z.string().describe("Search pattern (regex or plain text)"),
        path: z
          .string()
          .optional()
          .describe("Directory to search in, e.g. app"),
      })
    ),
  }),
};

export const maxDuration = 60;

const DEBUG = process.env.AGENT_DEBUG === "1";

export async function POST(req: Request) {
  if (DEBUG) console.log("[agent/stream] POST received");
  const body = await req.json();
  const { messages, projectId } = body as {
    messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }>; content?: string }>;
    projectId: string;
  };

  if (!projectId || !messages?.length) {
    if (DEBUG) console.log("[agent/stream] 400: missing projectId or messages");
    return new Response(
      JSON.stringify({ error: "projectId and messages required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let userApiKey: string | undefined;
  try {
    if (DEBUG) console.log("[agent/stream] consuming credits");
    const credits = await consumeCredits();
    userApiKey = credits.userApiKey;
  } catch (err) {
    if (err instanceof Error && err.message === "TOO_MANY_REQUESTS") {
      if (DEBUG) console.log("[agent/stream] 429: out of credits");
      return new Response(
        JSON.stringify({
          error: "You have run out of credits. Add your API key in settings.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    throw err;
  }

  // Optional: use AGENT_MODEL env (e.g. "openai:gpt-4o") for tool-calling models
  // K2 Think has no tool support — we use single-shot mode (text output with file blocks)
  const agentModelEnv = process.env.AGENT_MODEL;
  const useTools = agentModelEnv?.startsWith("openai:");

  let model: ReturnType<ReturnType<typeof createK2Think>>;
  if (useTools) {
    const openaiModel = agentModelEnv!.replace(/^openai:/, "");
    const openai = createOpenAI({
      apiKey: userApiKey ?? process.env.OPENAI_API_KEY,
    });
    model = openai(openaiModel);
  } else {
    const provider = createK2Think(userApiKey);
    model = provider(K2_THINK_MODEL);
  }

  const uiMessages = messages.map((m) => ({
    role: m.role.toLowerCase() as "user" | "assistant" | "system",
    parts:
      m.parts ??
      (m.content
        ? ([{ type: "text" as const, text: String(m.content) }] as const)
        : []),
  }));

  const coreMessages = useTools
    ? await convertToModelMessages(uiMessages as never, { tools: agentTools })
    : uiMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.parts?.map((p) => ("text" in p ? p.text : "")).join("") ?? "",
      }));

  if (DEBUG) console.log("[agent/stream] starting streamText", { useTools });
  const result = streamText({
    model,
    system: useTools ? PROMPT : PROMPT_SINGLE_SHOT,
    messages: coreMessages,
    ...(useTools && {
      tools: agentTools,
      stopWhen: stepCountIs(15),
    }),
    maxOutputTokens: 32768,
    temperature: 0.1,
  });

  if (DEBUG) console.log("[agent/stream] returning stream response");
  return result.toUIMessageStreamResponse();
}
