import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";

import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const settingsRouter = createTRPCRouter({
  hasApiKey: protectedProcedure.query(async ({ ctx }) => {
    const client = await clerkClient();
    const user = await client.users.getUser(ctx.auth.userId);
    const key = user.privateMetadata?.k2ThinkApiKey;
    return typeof key === "string" && key.length > 0;
  }),

  setApiKey: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1, { message: "API key is required" }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await clerkClient();
      const user = await client.users.getUser(ctx.auth.userId);
      const meta = (user.privateMetadata ?? {}) as Record<string, unknown>;
      await client.users.updateUser(ctx.auth.userId, {
        privateMetadata: { ...meta, k2ThinkApiKey: input.apiKey },
      });
      return { success: true };
    }),

  removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const client = await clerkClient();
    const user = await client.users.getUser(ctx.auth.userId);
    const meta = (user.privateMetadata ?? {}) as Record<string, unknown>;
    delete meta.k2ThinkApiKey;
    await client.users.updateUser(ctx.auth.userId, {
      privateMetadata: meta,
    });
    return { success: true };
  }),
});
