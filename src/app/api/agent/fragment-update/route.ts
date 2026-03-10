import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { flattenFileSystemTree } from "@/lib/template-flatten";
import { WEBCONTAINER_TEMPLATE } from "@/lib/webcontainer-template";

export const maxDuration = 10;

/**
 * Update an existing fragment's files (e.g. when agent applies fixes).
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const { fragmentId, files } = body as {
    fragmentId: string;
    files: Record<string, string>;
  };

  if (!fragmentId || !files || typeof files !== "object") {
    return new Response(
      JSON.stringify({ error: "fragmentId and files required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const validFiles = Object.fromEntries(
    Object.entries(files).filter(
      ([, c]) => typeof c === "string" && c.trim().length > 0
    )
  );

  const templateFlat = flattenFileSystemTree(WEBCONTAINER_TEMPLATE);
  const mergedFiles = { ...templateFlat, ...validFiles };

  const fragment = await prisma.fragment.findFirst({
    where: { id: fragmentId },
    include: { message: { include: { project: true } } },
  });

  if (!fragment || fragment.message.project.userId !== userId) {
    return new Response(
      JSON.stringify({ error: "Fragment not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  await prisma.fragment.update({
    where: { id: fragmentId },
    data: { files: mergedFiles },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
