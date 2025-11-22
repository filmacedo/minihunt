"use client";

import { useState, useEffect } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { MiniApp } from "@/lib/types";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";

interface BettingModalProps {
  app: MiniApp;
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean; // Kept for compatibility with my usage
}

export function BettingModal({ app, onClose, onSuccess, isOpen }: BettingModalProps) {
  const [amount, setAmount] = useState("1");
  const { context } = useMiniApp();
  const { post } = useApi();
  
  // Write Contract Hook
  const { data: hash, isPending, writeContract } = useWriteContract();
  
  // Transaction Receipt Hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleBet = async () => {
    if (!amount || !app) return;
    
    try {
      writeContract({
        address: process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: 'vote',
        args: [parseEther(amount), app.frameUrl],
        value: parseEther(amount),
      });
    } catch (error) {
      console.error("Betting failed:", error);
    }
  };

  // Effect to handle post-transaction API call
  useEffect(() => {
    if (isSuccess && hash && context?.user?.fid) {
      post("/api/miniapps/vote", {
        tx_hash: hash,
        fid: context.user.fid
      }).then(() => {
        onSuccess();
      }).catch(console.error);
    }
  }, [isSuccess, hash, context, post, onSuccess]);

  if (!isOpen || !app) return null;

  return (
    <ModalWrapper onClose={onClose} title="Bet on this MiniApp">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-20 h-20 bg-muted rounded-2xl mb-4 flex items-center justify-center text-4xl shadow-inner overflow-hidden">
          {app.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.iconUrl}
              alt={app.name || "App"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>📱</span>
          )}
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">
          {app.name || "Untitled App"}
        </h2>
        <p className="text-sm text-muted-foreground mb-1 truncate max-w-xs">
          {app.description || app.frameUrl}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {["1", "5", "10"].map((val) => (
          <button
            key={val}
            onClick={() => setAmount(val)}
            className={`py-2 rounded-xl text-sm font-bold font-mono transition-colors border ${
              amount === val 
                ? "bg-foreground text-background border-foreground" 
                : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {val} CELO
          </button>
        ))}
      </div>
      
      <div className="mb-6">
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-background border border-input rounded-xl h-14 px-4 text-foreground font-mono text-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-center"
            placeholder="Enter amount"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
            CELO
          </div>
        </div>
      </div>

      <Button
        className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono disabled:opacity-50"
        onClick={handleBet}
        disabled={isPending || isConfirming || !amount}
      >
        {isPending ? (
          <>
            <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            Confirm in Wallet...
          </>
        ) : isConfirming ? (
          <>
            <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Bet ${amount} CELO`
        )}
      </Button>
    </ModalWrapper>
  );
}
