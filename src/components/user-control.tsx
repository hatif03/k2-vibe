"use client";

import { useEffect, useState } from "react";
import { dark } from "@clerk/themes";
import { UserButton } from "@clerk/nextjs";

import { useCurrentTheme } from "@/hooks/use-current-theme";

interface Props {
  showName?: boolean;
};

export const UserControl = ({ showName }: Props) => {
  const [mounted, setMounted] = useState(false);
  const currentTheme = useCurrentTheme();

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: Clerk UserButton + useCurrentTheme differ on server vs client
  if (!mounted) {
    return (
      <div className="size-8 rounded-md bg-muted animate-pulse" aria-hidden />
    );
  }

  return (
    <UserButton
      showName={showName}
      appearance={{
        elements: {
          userButtonBox: "rounded-md!",
          userButtonAvatarBox: "rounded-md! size-8!",
          userButtonTrigger: "rounded-md!"
        },
        baseTheme: currentTheme === "dark" ? dark : undefined,
      }}
    />
  );
};
