"use client";

import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { PAST_WEEKS } from "@/lib/data";

interface ClaimModalProps {
  weekId: string;
  onClose: () => void;
}

export function ClaimModal({ weekId, onClose }: ClaimModalProps) {
  const week = PAST_WEEKS.find((w) => w.id === weekId);

  if (!week) return null;

  const handleClaim = () => {
    // Mock claim action
    alert("Rewards claimed successfully! (Mock)");
    onClose();
  };

  return (
    <ModalWrapper
      onClose={onClose}
      title={`Claim Week ${week.label.split("Week ")[1].split(" ")[0]} Rewards`}
    >
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-20 h-20 bg-yellow-400/20 rounded-full mb-4 flex items-center justify-center text-4xl">
          🏆
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-1 font-mono">
          ${week.winnings?.toFixed(2)}
        </h2>
        <p className="text-sm text-muted-foreground">Total Winnings</p>
      </div>

      <div className="bg-muted/30 rounded-xl border border-border p-4 mb-6 space-y-3">
        {week.items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {item.appName}
              </span>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                #{item.rank}
              </span>
            </div>
            <div className="font-mono text-foreground font-medium">
              ${item.winnings?.toFixed(2)}
            </div>
          </div>
        ))}
        <div className="border-t border-border/50 pt-3 flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Claim deadline</span>
          <span className="text-foreground font-mono">
            {week.claimDeadline}
          </span>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center mb-6 text-xs text-blue-200">
        Note: This is a demo. In the real app, this would trigger a wallet
        transaction.
      </div>

      <Button
        className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono"
        onClick={handleClaim}
      >
        Claim ${week.winnings?.toFixed(2)}
      </Button>
    </ModalWrapper>
  );
}
