"use client";

import { useState, useEffect, useRef } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { MiniApp } from "@/lib/types";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import { normalizeUrl } from "@/lib/miniapp-utils";
import { calculateAppHash } from "@/lib/app-utils";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`;

interface BettingModalProps {
  app: MiniApp;
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean; // Kept for compatibility with my usage
}

export function BettingModal({ app, onClose, onSuccess, isOpen }: BettingModalProps) {
  const { context } = useMiniApp();
  const { post } = useApi();
  const { address } = useAccount();
  const [priceChanged, setPriceChanged] = useState(false);
  const [bettingError, setBettingError] = useState<string | null>(null);
  const previousPriceRef = useRef<bigint | null>(null);
  
  // Calculate app hash
  const normalizedUrl = app?.frameUrl ? normalizeUrl(app.frameUrl) : undefined;
  const appHash = normalizedUrl ? calculateAppHash(app.frameUrl) : undefined;

  // Read native CELO balance
  const { data: balanceData } = useBalance({
    address: address,
    query: {
      enabled: isOpen && !!address,
    },
  });
  const balance = balanceData?.value;

  // Read price from contract with 5 second polling
  // Celo Sepolia chainId: 11142220
  const { data: price, error: priceError } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MINI_APP_WEEKLY_BETS_ABI,
    functionName: 'getPriceForNextVoteCurrentWeek',
    args: appHash ? [appHash] : undefined,
    chainId: 11142220, // Celo Sepolia
    query: {
      enabled: !!appHash && isOpen && !!CONTRACT_ADDRESS,
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
  
  // Vote transaction hooks
  const { 
    data: voteHash, 
    isPending: isVoting, 
    writeContract: writeVote,
    error: voteError,
  } = useWriteContract();

  const { 
    isLoading: isVoteConfirming, 
    isSuccess: isVoteSuccess 
  } = useWaitForTransactionReceipt({
    hash: voteHash,
  });
  
  // Format price for display (CELO has 18 decimals)
  const priceBigInt = price as bigint | undefined;
  const priceFormatted = priceBigInt ? formatUnits(priceBigInt, 18) : "0";

  // Handle vote transaction
  const handleVote = () => {
    if (!app || !appHash || !normalizedUrl || !priceBigInt) return;
    
    setBettingError(null);
    try {
      writeVote({
        address: CONTRACT_ADDRESS,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: 'vote',
        args: [appHash, normalizedUrl],
        value: priceBigInt, // Send native CELO
      });
    } catch (error) {
      console.error("Vote failed:", error);
      setBettingError(error instanceof Error ? error.message : "Failed to submit vote");
    }
  };

  // Handle bet button click
  const handleBet = () => {
    if (!app || !appHash || !priceBigInt || !address) return;
    
    setBettingError(null);

    // Check balance
    if (balance !== undefined && balance < priceBigInt) {
      const balanceFormatted = formatUnits(balance, 18);
      const requiredFormatted = formatUnits(priceBigInt, 18);
      setBettingError(
        `Insufficient CELO balance. You have ${balanceFormatted} CELO, but need ${requiredFormatted} CELO.`
      );
      return;
    }

    // Proceed with vote (no approval needed for native transfers)
    handleVote();
  };

  // Effect to handle post-transaction API call
  useEffect(() => {
    if (isVoteSuccess && voteHash && context?.user?.fid) {
      post("/api/miniapps/vote", {
        tx_hash: voteHash,
        fid: context.user.fid
      }).then(() => {
        onSuccess();
      }).catch((err) => {
        console.error("Vote indexing failed", err);
        // Don't block success callback if API submission fails
        onSuccess();
      });
    }
  }, [isVoteSuccess, voteHash, context, post, onSuccess]);

  // Update error state from transaction errors
  useEffect(() => {
    if (voteError) {
      setBettingError(voteError.message || "Vote transaction failed");
    }
  }, [voteError]);

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

      {bettingError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <Icons.Alert className="h-4 w-4" />
          <span>{bettingError}</span>
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
        disabled={
          isVoting || 
          isVoteConfirming || 
          !priceBigInt || 
          !appHash || 
          !address
        }
      >
        {isVoting ? (
          <>
            <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            Confirm in Wallet...
          </>
        ) : isVoteConfirming ? (
          <>
            <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Bet ${priceFormatted} CELO`
        )}
      </Button>
    </ModalWrapper>
  );
}
