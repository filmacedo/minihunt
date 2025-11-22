"use client";

import { useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-muted/50 border-b border-border p-4 relative">
      <div className="flex items-start gap-3 pr-8">
        <span className="text-lg">👋</span>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Bet on miniapps you think will win.{" "}
          <span className="font-semibold text-foreground">
            Top 3 split prizes!
          </span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setIsVisible(false)}
      >
        <Icons.Close className="h-4 w-4" />
        <span className="sr-only">Dismiss</span>
      </Button>
    </div>
  );
}
