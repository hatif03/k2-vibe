"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Project } from "@prisma/client";

interface ProjectCardProps {
  project: Project;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
}

function ProjectCard({ project, onRename, onDelete, onDuplicate }: ProjectCardProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Button
          variant="outline"
          className="font-normal h-auto justify-start w-full text-start p-4 group relative"
          asChild
        >
          <Link href={`/projects/${project.id}`}>
            <div className="flex items-center gap-x-4 flex-1 min-w-0">
              <Image
                src="/logo.svg"
                alt="K2 Vibe"
                width={32}
                height={32}
                className="object-contain shrink-0"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <h3 className="truncate font-medium">{project.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => onRename(project.id, project.name)}>
                    <PencilIcon />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(project.id)}>
                    <CopyIcon />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(project.id, project.name)}
                  >
                    <Trash2Icon />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Link>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onRename(project.id, project.name)}>
          <PencilIcon />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDuplicate(project.id)}>
          <CopyIcon />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(project.id, project.name)}
        >
          <Trash2Icon />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const ProjectsList = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { user } = useUser();
  const { data: projects } = useQuery(trpc.projects.getMany.queryOptions());

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameProject, setRenameProject] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProject, setDeleteProject] = useState<{ id: string; name: string } | null>(null);

  const updateProject = useMutation(trpc.projects.update.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      setRenameOpen(false);
      setRenameProject(null);
      toast.success("Project renamed");
    },
    onError: (error) => toast.error(error.message),
  }));

  const deleteProjectMutation = useMutation(trpc.projects.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      setDeleteOpen(false);
      setDeleteProject(null);
      toast.success("Project deleted");
    },
    onError: (error) => toast.error(error.message),
  }));

  const duplicateProject = useMutation(trpc.projects.duplicate.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      router.push(`/projects/${data.id}`);
      toast.success("Project duplicated");
    },
    onError: (error) => toast.error(error.message),
  }));

  const handleRename = (id: string, name: string) => {
    setRenameProject({ id, name });
    setRenameValue(name);
    setRenameOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteProject({ id, name });
    setDeleteOpen(true);
  };

  const handleDuplicate = (id: string) => {
    duplicateProject.mutate({ id });
  };

  const submitRename = () => {
    if (!renameProject || !renameValue.trim() || renameValue.trim() === renameProject.name) {
      setRenameOpen(false);
      return;
    }
    updateProject.mutate({ id: renameProject.id, name: renameValue.trim() });
  };

  const confirmDelete = () => {
    if (!deleteProject) return;
    deleteProjectMutation.mutate({ id: deleteProject.id });
  };

  if (!user) return null;

  return (
    <>
      <div className="w-full bg-white dark:bg-sidebar rounded-xl p-8 border flex flex-col gap-y-6 sm:gap-y-4">
        <h2 className="text-2xl font-semibold">{user?.firstName}&apos;s K2 Vibes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {projects?.length === 0 && (
            <div className="col-span-full text-center py-12">
              <p className="text-sm text-muted-foreground">No projects found</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first project above</p>
            </div>
          )}
          {projects?.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onRename={handleRename}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Project name"
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRename}
              disabled={
                !renameValue.trim() ||
                (renameProject && renameValue.trim() === renameProject.name) ||
                updateProject.isPending
              }
            >
              {updateProject.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteProject?.name}&quot; and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
