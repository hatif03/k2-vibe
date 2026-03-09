"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  PencilIcon,
  Share2Icon,
  SunMoonIcon,
  Trash2Icon,
  UploadIcon,
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
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  projectId: string;
  activeFragment: { id: string } | null;
}

export const ProjectHeader = ({ projectId, activeFragment }: Props) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { data: project } = useSuspenseQuery(
    trpc.projects.getOne.queryOptions({ id: projectId })
  );

  const { setTheme, theme } = useTheme();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Sync rename value when dialog opens
  const openRename = () => {
    setRenameValue(project.name);
    setRenameOpen(true);
  };

  const updateProject = useMutation(trpc.projects.update.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }));
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      setRenameOpen(false);
      toast.success("Project renamed");
    },
    onError: (error) => toast.error(error.message),
  }));

  const deleteProject = useMutation(trpc.projects.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      setDeleteOpen(false);
      router.push("/");
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

  const handleRename = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === project.name) {
      setRenameOpen(false);
      return;
    }
    updateProject.mutate({ id: projectId, name: trimmed });
  };

  const handleDelete = () => {
    deleteProject.mutate({ id: projectId });
  };

  const handleDuplicate = () => {
    duplicateProject.mutate({ id: projectId });
  };

  const createShare = useMutation(trpc.projects.createShare.mutationOptions({
    onSuccess: (data) => {
      const url = `${typeof window !== "undefined" ? window.location.origin : ""}${data.url}`;
      navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard");
    },
    onError: (error) => toast.error(error.message),
  }));

  const handleShare = () => {
    createShare.mutate({ projectId });
  };

  const [deploying, setDeploying] = useState(false);

  const handleDeploy = async () => {
    if (!activeFragment) {
      toast.error("Build something first, then deploy");
      return;
    }
    setDeploying(true);
    try {
      const res = await fetch("/api/deploy/vercel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fragmentId: activeFragment.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Deploy failed");
        return;
      }
      if (data.url) {
        navigator.clipboard.writeText(data.url);
        toast.success("Deployed! URL copied to clipboard");
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }));
      } else {
        toast.success("Deployment started. Check Vercel dashboard.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <>
      <header className="p-2 flex justify-between items-center border-b">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="focus-visible:ring-0 hover:bg-transparent hover:opacity-75 transition-opacity pl-2!"
            >
              <Image src="/logo.svg" alt="K2 Vibe" width={18} height={18} />
              <span className="text-sm font-medium">{project.name}</span>
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start">
            <DropdownMenuItem asChild>
              <Link href="/">
                <ChevronLeftIcon />
                <span>Go to Dashboard</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openRename}>
              <PencilIcon />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate} disabled={duplicateProject.isPending}>
              <CopyIcon />
              <span>Duplicate</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleShare}
              disabled={createShare.isPending}
            >
              <Share2Icon />
              <span>{createShare.isPending ? "Creating..." : "Share"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDeploy}
              disabled={!activeFragment || deploying}
            >
              <UploadIcon />
              <span>{deploying ? "Deploying..." : "Deploy to Vercel"}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              <span>Delete</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <SunMoonIcon className="size-4 text-muted-foreground" />
                <span>Appearance</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">
                      <span>Light</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <span>Dark</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <span>System</span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Project name"
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameValue.trim() || renameValue.trim() === project.name || updateProject.isPending}
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
              This will permanently delete &quot;{project.name}&quot; and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProject.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
