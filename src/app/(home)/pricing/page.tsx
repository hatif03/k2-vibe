"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// BILLING: PricingTable removed. Add back when re-enabling subscriptions.
// import { dark } from "@clerk/themes";
// import { PricingTable } from "@clerk/nextjs";
// import { useCurrentTheme } from "@/hooks/use-current-theme";

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
        <h1 className="text-xl md:text-3xl font-bold text-center">
          Experiment freely
        </h1>
        <p className="text-muted-foreground text-center text-sm md:text-base">
          No limits for now. Build as much as you like with K2 Vibe.
        </p>
        <div className="flex justify-center pt-4">
          <Button asChild>
            <Link href="/">Start building</Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Page;