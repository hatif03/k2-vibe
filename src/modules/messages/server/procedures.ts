import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { prisma } from "@/lib/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";

export const messagesRouter = createTRPCRouter({
  getMany: protectedProcedure
  .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .query(async ({ input, ctx }) => {
      const messages = await prisma.message.findMany({
        where: {
          projectId: input.projectId,
          project: {
            userId: ctx.auth.userId,
          },
        },
        include: {
          fragment: true,
        },
        orderBy: {
          updatedAt: "asc",
        },
      });

      return messages;
    }),
  create: protectedProcedure
    .input(
      z.object({
        value: z.string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" }),
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.projectId,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const createdMessage = await prisma.message.create({
        data: {
          projectId: existingProject.id,
          content: input.value,
          role: "USER",
          type: "RESULT",
        },
      });

      return createdMessage;
    }),
  saveAgentResult: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        content: z.string(),
        files: z.record(z.string(), z.string()),
        title: z.string(),
        sandboxUrl: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          userId: ctx.auth.userId,
        },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const message = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.content,
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create: {
              sandboxUrl: input.sandboxUrl ?? "",
              title: input.title,
              files: input.files,
            },
          },
        },
        include: { fragment: true },
      });

      return message;
    }),
  saveAgentError: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        content: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          userId: ctx.auth.userId,
        },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.content,
          role: "ASSISTANT",
          type: "ERROR",
        },
      });
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        projectId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const message = await prisma.message.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
          project: { userId: ctx.auth.userId },
        },
      });

      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      }

      await prisma.message.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
