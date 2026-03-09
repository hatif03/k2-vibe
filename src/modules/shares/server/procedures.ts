import { z } from "zod";

import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "@/trpc/init";

export const sharesRouter = createTRPCRouter({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const share = await prisma.share.findUnique({
        where: { slug: input.slug },
        include: {
          project: {
            include: {
              messages: {
                include: { fragment: true },
                orderBy: { updatedAt: "asc" as const },
              },
            },
          },
        },
      });
      if (!share) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
      }
      return share;
    }),
});
