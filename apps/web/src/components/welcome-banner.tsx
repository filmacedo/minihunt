"use client";

import { useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-muted/50 border-b border-border px-4 py-3 sm:px-6 sm:py-4 relative">
      <div className="flex items-start gap-2 sm:gap-3 pr-8 sm:pr-10">
        <span className="text-base sm:text-lg flex-shrink-0">👋</span>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed flex-1">
          Bet on miniapps you think will win.{" "}
          <span className="font-semibold text-foreground">
            Top 3 split prizes!
          </span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setIsVisible(false)}
      >
        <Icons.Close className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="sr-only">Dismiss</span>
      </Button>
    </div>
  );
}
