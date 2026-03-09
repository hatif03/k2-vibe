import { z } from "zod";
import { generateSlug } from "random-word-slugs";

import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
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

      return createdProject;
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1, { message: "Id is required" }),
        name: z.string().min(1, { message: "Name is required" }).max(100, { message: "Name is too long" }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.project.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return prisma.project.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    }),
  delete: protectedProcedure
    .input(z.object({
      id: z.string().min(1, { message: "Id is required" }),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.project.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      await prisma.project.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
  duplicate: protectedProcedure
    .input(z.object({
      id: z.string().min(1, { message: "Id is required" }),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.project.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
        include: {
          messages: {
            include: { fragment: true },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const created = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          name: `${existing.name}-copy`,
          messages: {
            create: existing.messages.map((m) => ({
              content: m.content,
              role: m.role,
              type: m.type,
              ...(m.fragment && {
                fragment: {
                  create: {
                    sandboxUrl: m.fragment.sandboxUrl,
                    title: m.fragment.title,
                    files: m.fragment.files ?? {},
                  },
                },
              }),
            })),
          },
        },
      });

      return created;
    }),
  createShare: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      const slug = generateSlug(3, { format: "kebab" });
      const share = await prisma.share.create({
        data: { projectId: project.id, slug },
      });
      return { share, url: `/s/${share.slug}` };
    }),
});
