"use client";

import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { formatUnits } from "viem";

interface ClaimModalProps {
  weekId: string;
  earned: string; // Total earned amount in wei
  onClose: () => void;
}

export function ClaimModal({ weekId, earned, onClose }: ClaimModalProps) {
  const earnedFormatted = formatUnits(BigInt(earned), 6);

  const handleClaim = () => {
    // TODO: Implement claim transaction
    // This will trigger a wallet transaction to claim rewards
    alert("Claim feature coming soon!");
    onClose();
  };

  return (
    <ModalWrapper
      onClose={onClose}
      title={`Claim Week Rewards`}
    >
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-20 h-20 bg-yellow-400/20 rounded-full mb-4 flex items-center justify-center text-4xl">
          🏆
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-1 font-mono">
          {earnedFormatted} USDC
        </h2>
        <p className="text-sm text-muted-foreground">Total Winnings</p>
      </div>

      <div className="bg-muted/30 rounded-xl border border-border p-4 mb-6">
        <div className="text-center text-sm text-muted-foreground">
          Week ID: {weekId}
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center mb-6 text-xs text-blue-200">
        Note: Claim feature will be implemented soon. This will trigger a wallet
        transaction to claim your rewards.
      </div>

      <Button
        className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleClaim}
        disabled={true}
      >
        Claim {earnedFormatted} USDC
      </Button>
    </ModalWrapper>
  );
}
