"use client";

import { useState, useEffect } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";

interface SubmitAppModalProps {
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean;
}

export function SubmitAppModal({ onClose, onSuccess, isOpen }: SubmitAppModalProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [isValid, setIsValid] = useState(true); // Assume valid for now or add regex check
  
  const { context } = useMiniApp();
  const { post } = useApi();
  
  // Write Contract Hook
  const { data: hash, isPending, writeContract } = useWriteContract();
  
  // Transaction Receipt Hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleSubmit = async () => {
    if (!url) return;
    
    try {
      // Step 1: Save metadata (optimistic)
      try {
        await post("/api/miniapps", {
          frameUrl: url,
          frameSignature: url, 
          name,
          description,
          iconUrl
        });
      } catch (err) {
        console.warn("Metadata save failed", err);
      }

      // Step 2: Submit to blockchain
      const amount = "1"; 

      writeContract({
        address: process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: 'vote',
        args: [parseEther(amount), url],
        value: parseEther(amount),
      });
      
    } catch (error) {
      console.error("Submission failed:", error);
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
      }).catch((err) => {
        console.error("Vote indexing failed", err);
        onSuccess();
      });
    }
  }, [isSuccess, hash, context, post, onSuccess]);

  if (!isOpen) return null;

  return (
    <ModalWrapper onClose={onClose} title="Submit New App">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Frame URL *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-background border border-input rounded-lg h-12 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isPending || isConfirming}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            App Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome App"
            className="w-full bg-background border border-input rounded-lg h-12 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isPending || isConfirming}
          />
        </div>

        <div>
           <label className="text-sm font-medium text-foreground mb-2 block">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this app do?"
            className="w-full bg-background border border-input rounded-lg p-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 h-24 resize-none"
            disabled={isPending || isConfirming}
          />
        </div>

         <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Icon URL
          </label>
          <input
            type="url"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://.../icon.png"
            className="w-full bg-background border border-input rounded-lg h-12 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isPending || isConfirming}
          />
        </div>

        <Button
          disabled={!isValid || !url || isPending || isConfirming}
          onClick={handleSubmit}
          className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
             <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Check Wallet...
            </>
          ) : isConfirming ? (
             <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Confirming...
            </>
          ) : (
            "Submit for 1 CELO"
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground mt-2">
          (Counts as your first bet)
        </p>
      </div>
    </ModalWrapper>
  );
}
