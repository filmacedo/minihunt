"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/frame-sdk";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { env } from "@/lib/env";

export function FarcasterCheck({ children }: { children: React.ReactNode }) {
  const [isInFarcaster, setIsInFarcaster] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkFarcaster = async () => {
      try {
        // Check if we're in an iframe (Farcaster loads apps in iframes)
        let isInIframe = false;
        try {
          isInIframe = typeof window !== "undefined" && window.self !== window.top;
        } catch {
          // Cross-origin iframe check might throw, which also indicates we're in an iframe
          isInIframe = true;
        }
        
        // Try to access the Farcaster SDK context
        let hasContext = false;
        try {
          const context = await Promise.race([
            sdk.context,
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
          ]);
          hasContext = !!context;
        } catch {
          // SDK not available or timed out
          hasContext = false;
        }

        // Check user agent for Farcaster indicators
        const userAgent = typeof window !== "undefined" ? window.navigator.userAgent : "";
        const hasFarcasterUA = userAgent.includes("Farcaster") || userAgent.includes("Warpcast");

        // We're in Farcaster if we have SDK context (most reliable indicator)
        // OR if we're in an iframe with Farcaster user agent
        const inFarcaster = hasContext || (isInIframe && hasFarcasterUA);
        
        setIsInFarcaster(inFarcaster);
      } catch {
        // If all checks fail, assume we're not in Farcaster
        setIsInFarcaster(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkFarcaster();
  }, []);

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Icons.Spinner className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If not in Farcaster, show the message
  if (isInFarcaster === false) {
    const appUrl = env.NEXT_PUBLIC_URL;
    const warpcastComposeUrl = `https://farcaster.xyz/~/compose?embeds[]=${encodeURIComponent(appUrl)}`;
    
    const handleOpenInWarpcast = () => {
      window.open(warpcastComposeUrl, "_blank");
    };
    
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-muted rounded-full mx-auto flex items-center justify-center mb-4">
            <Icons.Alert className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Open in Farcaster
          </h1>
          <p className="text-muted-foreground">
            MiniHunt only works within the Farcaster app for now. Click the button below to open it in Farcaster.
          </p>
          <div className="space-y-3 pt-4">
            <Button
              className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono"
              onClick={handleOpenInWarpcast}
            >
              Open in Farcaster
            </Button>
            <p className="text-xs text-muted-foreground">
              This will open Farcaster with MiniHunt ready to use
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If in Farcaster, render children normally
  return <>{children}</>;
}

