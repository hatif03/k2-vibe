"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { KeyRoundIcon } from "lucide-react";

const Page = () => {
  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <section className="space-y-6 pt-[16vh] 2xl:pt-48">
        <div className="flex flex-col items-center">
          <Image
            src="/logo.svg"
            alt="K2 Vibe"
            width={50}
            height={50}
            className="hidden md:block"
          />
        </div>
        <h1 className="text-xl md:text-3xl font-bold text-center">Pricing</h1>
        <p className="text-muted-foreground text-center text-sm md:text-base">
          Build as many apps as you want
        </p>
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">25 free credits</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Every user gets 25 credits per month to build apps. Credits reset
              automatically.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-lg">Use your own API key</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Run out of credits? Add your own K2 Think API key in settings to
              continue building with no limits.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/settings">
                <KeyRoundIcon className="size-4 mr-2" />
                Add API key
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Page;