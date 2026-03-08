import { z } from "zod";
import { generateSlug } from "random-word-slugs";

import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { inngest } from "@/inngest/client";
import { consumeCredits } from "@/lib/usage";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({
      id: z.string().min(1, { message: "Id is required" }),
    }))
    .query(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return existingProject;
    }),
  getMany: protectedProcedure
    .query(async ({ ctx }) => {
      const projects = await prisma.project.findMany({
        where: {
          userId: ctx.auth.userId,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      return projects;
    }),
  create: protectedProcedure
    .input(
      z.object({
        value: z.string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" })
      }),
    )
    .mutation(async ({ input, ctx }) => {
      let userApiKey: string | undefined;
      try {
        const result = await consumeCredits();
        userApiKey = result.userApiKey;
      } catch (error) {
        if (error instanceof Error && error.message === "TOO_MANY_REQUESTS") {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You have run out of credits. Add your API key in settings to continue.",
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Something went wrong" });
      }

      const createdProject = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          name: generateSlug(2, {
            format: "kebab",
          }),
          messages: {
            create: {
              content: input.value,
              role: "USER",
              type: "RESULT",
            }
          }
        }
      });

      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: createdProject.id,
          userApiKey,
        },
      });

      return createdProject;
    }),
});
