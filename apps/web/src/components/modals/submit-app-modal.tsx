"use client";

import { useState, useEffect } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import { type FarcasterManifest } from "@/lib/miniapp-utils";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { cn } from "@/lib/utils";

interface SubmitAppModalProps {
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean;
}

interface ValidationResult {
  isValid: boolean;
  hasParticipatedBefore: boolean;
  manifest: FarcasterManifest | null;
  error?: string;
}

export function SubmitAppModal({ onClose, onSuccess, isOpen }: SubmitAppModalProps) {
  const [url, setUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  
  const { context } = useMiniApp();
  const { post } = useApi();
  
  // Write Contract Hook
  const { data: hash, isPending, writeContract } = useWriteContract();
  
  // Transaction Receipt Hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Debounced validation effect
  useEffect(() => {
    if (!url.trim()) {
      setValidationResult(null);
      setIsValidating(false);
      return;
    }

    // Basic URL format validation
    try {
      new URL(url);
    } catch {
      setValidationResult({
        isValid: false,
        hasParticipatedBefore: false,
        manifest: null,
        error: "Invalid URL format",
      });
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    const timeoutId = setTimeout(async () => {
      try {
        const result = await post("/api/miniapps/validate", { url }) as ValidationResult;
        setValidationResult(result);
      } catch (error) {
        setValidationResult({
          isValid: false,
          hasParticipatedBefore: false,
          manifest: null,
          error: error instanceof Error ? error.message : "Failed to validate URL",
        });
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [url, post]);

  const handleSubmit = async () => {
    if (!url || !validationResult?.manifest) return;
    
    try {
      const frame = validationResult.manifest.frame || validationResult.manifest.miniapp;
      if (!frame) return;

      // Step 1: Save metadata (optimistic)
      try {
        await post("/api/miniapps", {
          frameUrl: url,
          frameSignature: url,
          name: frame.name || null,
          description: frame.description || frame.tagline || null,
          iconUrl: frame.iconUrl || null,
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

  const frame = validationResult?.manifest?.frame || validationResult?.manifest?.miniapp;
  const appName = frame?.name || "Untitled App";
  const appDescription = frame?.description || frame?.tagline || "";
  const appIcon = frame?.iconUrl || null;

  const canSubmit = 
    !isValidating &&
    validationResult !== null &&
    validationResult.isValid === true &&
    validationResult.hasParticipatedBefore === false &&
    url.length > 0;

  return (
    <ModalWrapper onClose={onClose} title="Submit New App">
      <div className="space-y-4 w-full overflow-hidden">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Enter miniapp URL
          </label>
          <div className="relative">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://myapp.xyz"
              className={cn(
                "w-full bg-background border rounded-lg h-12 px-4 pr-12 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                validationResult?.isValid === false && !isValidating
                  ? "border-red-500/50 focus:ring-red-500/20"
                  : validationResult?.isValid === true && !isValidating
                  ? "border-green-500/50 focus:ring-green-500/20"
                  : "border-input"
              )}
              disabled={isPending || isConfirming}
            />
            {isValidating && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Icons.Spinner className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isValidating && validationResult?.isValid === true && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Icons.Check className="h-4 w-4 text-green-500" />
              </div>
            )}
            {!isValidating && validationResult?.isValid === false && validationResult.error && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Icons.Close className="h-4 w-4 text-red-500" />
              </div>
            )}
          </div>
        </div>

        {/* Preview Section */}
        {frame && validationResult?.manifest && (
          <div className="bg-card rounded-xl border border-border p-4 w-full overflow-hidden">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Preview
            </div>
            <div className="flex items-center gap-3 w-full min-w-0">
              <Avatar className="flex-none w-12 h-12 rounded-lg shrink-0">
                <AvatarImage
                  src={appIcon || undefined}
                  alt={appName}
                  className="rounded-lg object-cover"
                />
                <AvatarFallback className="rounded-lg bg-muted text-muted-foreground font-semibold">
                  {appName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 overflow-hidden">
                <h3 className="font-semibold text-foreground truncate text-base">
                  {appName}
                </h3>
                {appDescription && (
                  <p className="text-sm text-muted-foreground truncate">
                    {appDescription}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Validation Status Indicators */}
        {validationResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {validationResult.isValid ? (
                <>
                  <Icons.Check className="h-4 w-4 text-green-500 flex-none" />
                  <span className="text-foreground">URL is valid</span>
                </>
              ) : (
                <>
                  <Icons.Close className="h-4 w-4 text-red-500 flex-none" />
                  <span className="text-red-500">
                    {validationResult.error || "URL is not valid"}
                  </span>
                </>
              )}
            </div>
            {validationResult.isValid && (
              <div className="flex items-center gap-2 text-sm">
                {!validationResult.hasParticipatedBefore ? (
                  <>
                    <Icons.Check className="h-4 w-4 text-green-500 flex-none" />
                    <span className="text-foreground">App not yet submitted</span>
                  </>
                ) : (
                  <>
                    <Icons.Close className="h-4 w-4 text-red-500 flex-none" />
                    <span className="text-red-500">App already submitted or has votes</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error Messages */}
        {validationResult?.error && validationResult.isValid === false && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
            {validationResult.error}
          </div>
        )}

        {validationResult?.hasParticipatedBefore && validationResult.isValid && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-500">
            This app has already been submitted or has votes. You cannot submit it again.
          </div>
        )}

        <Button
          disabled={!canSubmit || isPending || isConfirming}
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
            "Submit for $1.00"
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground mt-2">
          (Counts as your first bet)
        </p>
      </div>
    </ModalWrapper>
  );
}
