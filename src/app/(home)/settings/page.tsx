"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRoundIcon, Loader2Icon, UploadIcon } from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  apiKey: z.string().min(1, { message: "API key is required" }),
});

const vercelFormSchema = z.object({
  vercelToken: z.string().min(1, { message: "Vercel token is required" }),
});

export default function SettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);

  const { data: hasApiKey } = useQuery(trpc.settings.hasApiKey.queryOptions());
  const { data: hasVercelToken } = useQuery(
    trpc.settings.hasVercelToken.queryOptions()
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { apiKey: "" },
  });

  const setApiKey = useMutation(trpc.settings.setApiKey.mutationOptions({
    onSuccess: () => {
      toast.success("API key saved");
      form.reset();
      queryClient.invalidateQueries(trpc.settings.hasApiKey.queryOptions());
    },
    onError: (e) => toast.error(e.message),
  }));

  const vercelForm = useForm<z.infer<typeof vercelFormSchema>>({
    resolver: zodResolver(vercelFormSchema),
    defaultValues: { vercelToken: "" },
  });

  const setVercelToken = useMutation(
    trpc.settings.setVercelToken.mutationOptions({
      onSuccess: () => {
        toast.success("Vercel token saved");
        vercelForm.reset();
        queryClient.invalidateQueries(
          trpc.settings.hasVercelToken.queryOptions()
        );
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const removeVercelToken = useMutation(
    trpc.settings.removeVercelToken.mutationOptions({
      onSuccess: () => {
        toast.success("Vercel token removed");
        queryClient.invalidateQueries(
          trpc.settings.hasVercelToken.queryOptions()
        );
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const removeApiKey = useMutation(trpc.settings.removeApiKey.mutationOptions({
    onSuccess: () => {
      toast.success("API key removed");
      queryClient.invalidateQueries(trpc.settings.hasApiKey.queryOptions());
    },
    onError: (e) => toast.error(e.message),
  }));

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setApiKey.mutate({ apiKey: values.apiKey });
  };

  return (
    <div className="flex flex-col max-w-xl mx-auto w-full pt-24">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Manage your K2 Think API key to continue building after using your free credits.
      </p>

      <div className="mt-8 rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          K2 Think API Key
        </h2>
        {hasApiKey ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Your API key is saved. You can use the app beyond your free credits.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => removeApiKey.mutate()}
              disabled={removeApiKey.isPending}
            >
              {removeApiKey.isPending ? <Loader2Icon className="size-4 animate-spin" /> : "Remove API key"}
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={showKey ? "text" : "password"}
                        placeholder="sk-..."
                        autoComplete="off"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-muted-foreground"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? "Hide" : "Show"} key
                    </Button>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={setApiKey.isPending}>
                {setApiKey.isPending ? <Loader2Icon className="size-4 animate-spin" /> : "Save API key"}
              </Button>
            </form>
          </Form>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Get your API key from{" "}
        <a
          href="https://api.k2think.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          api.k2think.ai
        </a>
        . Your key is stored securely and only used when you run out of free credits.
      </p>

      <div className="mt-8 rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <UploadIcon className="size-4" />
          Vercel Token (for Deploy)
        </h2>
        {hasVercelToken ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Your Vercel token is saved. You can deploy projects to Vercel.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => removeVercelToken.mutate()}
              disabled={removeVercelToken.isPending}
            >
              {removeVercelToken.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Remove Vercel token"
              )}
            </Button>
          </div>
        ) : (
          <Form {...vercelForm}>
            <form
              onSubmit={vercelForm.handleSubmit((v) =>
                setVercelToken.mutate({ token: v.vercelToken })
              )}
              className="space-y-4"
            >
              <FormField
                control={vercelForm.control}
                name="vercelToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vercel Token</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={showKey ? "text" : "password"}
                        placeholder="vercel_..."
                        autoComplete="off"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={setVercelToken.isPending}>
                {setVercelToken.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  "Save Vercel token"
                )}
              </Button>
            </form>
          </Form>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Get your Vercel token from{" "}
        <a
          href="https://vercel.com/account/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          vercel.com/account/tokens
        </a>
        . Required for deploying projects to Vercel.
      </p>
    </div>
  );
}
