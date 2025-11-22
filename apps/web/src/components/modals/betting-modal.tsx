"use client";

import { useState, useEffect, useRef } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { MiniApp } from "@/lib/types";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { keccak256, stringToHex, formatUnits } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import { normalizeUrl } from "@/lib/miniapp-utils";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";

interface BettingModalProps {
  app: MiniApp;
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean; // Kept for compatibility with my usage
}

export function BettingModal({ app, onClose, onSuccess, isOpen }: BettingModalProps) {
  const { context } = useMiniApp();
  const { post } = useApi();
  const [priceChanged, setPriceChanged] = useState(false);
  const previousPriceRef = useRef<bigint | null>(null);
  
  // Calculate app hash
  const appHash = app?.frameUrl ? keccak256(stringToHex(normalizeUrl(app.frameUrl))) : undefined;

  // Read price from contract with 5 second polling
  // Celo Sepolia chainId: 11142220
  const { data: price, error: priceError } = useReadContract({
    address: process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`,
    abi: MINI_APP_WEEKLY_BETS_ABI,
    functionName: 'getPriceForNextVoteCurrentWeek',
    args: appHash ? [appHash] : undefined,
    chainId: 11142220, // Celo Sepolia
    query: {
      enabled: !!appHash && isOpen && !!process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  // Log for debugging
  useEffect(() => {
    if (priceError) {
      console.error("Price fetch error:", priceError);
    }
  }, [priceError]);
  
  // Track price changes
  useEffect(() => {
    const currentPrice = price as bigint | undefined;
    if (currentPrice !== undefined && previousPriceRef.current !== null) {
      if (currentPrice !== previousPriceRef.current) {
        setPriceChanged(true);
        // Auto-hide notice after 3 seconds
        const timer = setTimeout(() => setPriceChanged(false), 3000);
        return () => clearTimeout(timer);
      }
    }
    if (currentPrice !== undefined) {
      previousPriceRef.current = currentPrice;
    }
  }, [price]);
  
  // Write Contract Hook
  const { data: hash, isPending, writeContract } = useWriteContract();
  
  // Transaction Receipt Hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });
  
  // Format price for display (USDC has 6 decimals)
  const priceBigInt = price as bigint | undefined;
  const priceFormatted = priceBigInt ? formatUnits(priceBigInt, 6) : "0";

  const handleBet = async () => {
    if (!app || !appHash) return;
    
    try {
      writeContract({
        address: process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: 'vote',
        args: [appHash, app.frameUrl],
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

      {priceChanged && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
          <Icons.Alert className="h-4 w-4" />
          <span>Price has changed! Please review the new amount.</span>
        </div>
      )}
      
      <div className="mb-6">
        <div className="relative">
          <div className="mt-2 text-xs text-center text-muted-foreground">
            Current voting price (updates every 5 seconds)
          </div>
        </div>
      </div>

      <Button
        className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono disabled:opacity-50"
        onClick={handleBet}
        disabled={isPending || isConfirming || !priceBigInt || !appHash}
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
          `Bet ${priceFormatted} USDC`
        )}
      </Button>
    </ModalWrapper>
  );
}
