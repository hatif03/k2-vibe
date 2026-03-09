import { auth, clerkClient } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";
import { buildDeployFiles } from "@/lib/vercel-deploy";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const { fragmentId } = body as { fragmentId: string };

  if (!fragmentId) {
    return new Response(
      JSON.stringify({ error: "fragmentId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const fragment = await prisma.fragment.findFirst({
    where: {
      id: fragmentId,
      message: {
        project: { userId },
      },
    },
    include: { message: { include: { project: true } } },
  });

  if (!fragment) {
    return new Response(
      JSON.stringify({ error: "Fragment not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const vercelToken = user.privateMetadata?.vercelToken;
  if (typeof vercelToken !== "string" || !vercelToken) {
    return new Response(
      JSON.stringify({
        error: "Vercel token not configured. Add it in Settings.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const files = fragment.files && typeof fragment.files === "object"
    ? (fragment.files as Record<string, string>)
    : {};
  const deployFiles = buildDeployFiles(files);

  const filesPayload = Object.entries(deployFiles).map(([path, content]) => ({
    file: path,
    data: content,
    encoding: "utf-8" as const,
  }));

  const projectName = `k2-vibe-${fragment.message.project.name}-${fragment.id.slice(0, 8)}`.replace(
    /[^a-z0-9-]/gi,
    "-"
  );

  try {
    const res = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        files: filesPayload,
        projectSettings: {
          framework: "nextjs",
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: data.error?.message ?? "Vercel deployment failed",
        }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const deploymentUrl = data.url
      ? (data.url.startsWith("http") ? data.url : `https://${data.url}`)
      : data.alias?.[0]
        ? `https://${data.alias[0]}`
        : null;

    if (deploymentUrl) {
      await prisma.fragment.update({
        where: { id: fragmentId },
        data: { sandboxUrl: deploymentUrl },
      });
    }

    return new Response(
      JSON.stringify({
        url: deploymentUrl ?? data.url,
        deploymentId: data.id,
        state: data.readyState,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Deployment failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
