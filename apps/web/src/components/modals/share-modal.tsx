"use client";

import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { sdk } from "@farcaster/frame-sdk";

interface ShareModalProps {
  onClose: () => void;
}

export function ShareModal({ onClose }: ShareModalProps) {
  const handleShare = () => {
    try {
      sdk.actions.openUrl(
        `https://warpcast.com/~/compose?text=I%20just%20bet%20on%20MiniHunt!%20Check%20it%20out%20at%20https://minihunt.xyz`
      );
    } catch (e) {
      console.error("Failed to open share URL", e);
    }
    onClose();
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="flex flex-col items-center text-center pt-4 pb-2">
        <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-4">
          <Icons.Check className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">
          Bet Confirmed!
        </h2>
        <p className="text-muted-foreground mb-8">You bet on TaskMaster Pro</p>

        <div className="flex w-full justify-between px-8 mb-8 border-y border-border py-6">
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Your Bets
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              3
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Total Spent
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              $3.09
            </div>
          </div>
        </div>

        <Button
          onClick={handleShare}
          className="w-full mb-3 bg-foreground text-background hover:bg-foreground/90"
        >
          <Icons.ExternalLink className="w-4 h-4 mr-2" />
          Share on Farcaster
        </Button>

        <Button
          variant="ghost"
          onClick={onClose}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          Skip
        </Button>
      </div>
    </ModalWrapper>
  );
}
