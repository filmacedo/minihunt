"use client";

import { useState, useEffect } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount, useBalance, useConnect } from "wagmi";
import { formatUnits } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import { type FarcasterManifest, normalizeUrl } from "@/lib/miniapp-utils";
import { calculateAppHash } from "@/lib/app-utils";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { cn } from "@/lib/utils";
import { sdk } from "@farcaster/frame-sdk";
import { env } from "@/lib/env";

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

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`;

export function SubmitAppModal({ onClose, onSuccess, isOpen }: SubmitAppModalProps) {
  const [url, setUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const { context } = useMiniApp();
  const { post } = useApi();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  
  // Read native CELO balance
  const { data: balanceData } = useBalance({
    address: address,
    query: {
      enabled: isOpen && !!address,
    },
  });
  const balance = balanceData?.value;

  // Read initial price from contract
  const { data: initialPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MINI_APP_WEEKLY_BETS_ABI,
    functionName: "initialPrice",
    query: {
      enabled: isOpen && !!CONTRACT_ADDRESS,
    },
  }) as { data: bigint | undefined };

  // Vote transaction hooks
  const { 
    data: voteHash, 
    isPending: isVoting, 
    writeContract: writeVote,
    error: voteError,
  } = useWriteContract();

  const { 
    isLoading: isVoteConfirming, 
    isSuccess: isVoteSuccess,
    data: receipt
  } = useWaitForTransactionReceipt({
    hash: voteHash,
    confirmations: 3, // Wait for 3 confirmations
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

  const handleVote = async () => {
    if (!url || !validationResult?.manifest || !initialPrice) return;
    
    try {
      setSubmissionError(null);
      const normalizedUrl = normalizeUrl(url);
      const appHash = calculateAppHash(url);

      // Step 1: Save metadata (optimistic)
      try {
        const frame = validationResult.manifest.frame || validationResult.manifest.miniapp;
        if (frame) {
          await post("/api/miniapps", {
            frameUrl: url,
            frameSignature: appHash,
            name: frame.name || null,
            description: frame.description || frame.tagline || null,
            iconUrl: frame.iconUrl || null,
          });
        }
      } catch (err) {
        console.warn("Metadata save failed", err);
      }

      // Step 2: Submit to blockchain with native CELO
      writeVote({
        address: CONTRACT_ADDRESS,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: "vote",
        args: [appHash, normalizedUrl],
        value: initialPrice, // Send native CELO
        chainId: 42220, // Celo Mainnet
      });
    } catch (error) {
      console.error("Vote failed:", error);
      setSubmissionError(error instanceof Error ? error.message : "Failed to submit vote");
    }
  };

  const handleSubmit = async () => {
    if (!url || !validationResult?.manifest || !initialPrice) return;
    
    setSubmissionError(null);

    // Check if wallet is connected, connect if not
    if (!isConnected) {
      const connector = connectors[0];
      if (connector) {
        connect({ connector });
      } else {
        setSubmissionError("Wallet connector not available");
      }
      return;
    }

    if (!address) {
      setSubmissionError("Wallet address not available");
      return;
    }

    // Check balance
    if (balance !== undefined && balance < initialPrice) {
      const balanceFormatted = formatUnits(balance, 18);
      const requiredFormatted = formatUnits(initialPrice, 18);
      setSubmissionError(
        `Insufficient CELO balance. You have ${balanceFormatted} CELO, but need ${requiredFormatted} CELO.`
      );
      return;
    }

    // Proceed with vote (no approval needed for native transfers)
    handleVote();
  };

  // Effect to handle post-transaction API call (only after 3 confirmations)
  useEffect(() => {
    if (isVoteSuccess && receipt && voteHash && context?.user?.fid) {
      // Only proceed if we have 3 confirmations (receipt means confirmations are met)
      post("/api/miniapps/vote", {
        tx_hash: voteHash,
        fid: context.user.fid
      }).then(async () => {
        // Show success message
        setIsSuccess(true);
        
        // Prompt user to cast after successful API call
        try {
          const appUrl = env.NEXT_PUBLIC_URL;
          const frame = validationResult?.manifest?.frame || validationResult?.manifest?.miniapp;
          const submittedAppName = frame?.name || "a new MiniApp";
          const text = `I just submitted ${submittedAppName} to MiniHunt! 🚀\n\nCheck it out: ${appUrl}`;
          
          // Include app image URL if available, otherwise just the app URL
          const imageUrl = frame?.imageUrl || frame?.iconUrl;
          const embeds = imageUrl 
            ? [appUrl, imageUrl] as [string, string]
            : [appUrl] as [string];
          
          await sdk.actions.composeCast({ text, embeds });
        } catch (err) {
          console.error("Failed to prompt cast", err);
          // Don't block success callback if cast prompt fails
        }
        
        // Auto-close after 3 seconds
        setTimeout(() => {
          onSuccess();
        }, 3000);
      }).catch((err) => {
        console.error("Vote indexing failed", err);
        // Don't block success callback if API submission fails
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 3000);
      });
    }
  }, [isVoteSuccess, receipt, voteHash, context, post, onSuccess, validationResult]);

  // Update error state from transaction errors
  useEffect(() => {
    if (voteError) {
      setSubmissionError(voteError.message || "Vote transaction failed");
    }
  }, [voteError]);

  if (!isOpen) return null;

  // Show success state
  if (isSuccess) {
    const frame = validationResult?.manifest?.frame || validationResult?.manifest?.miniapp;
    const appName = frame?.name || "your app";
    
    return (
      <ModalWrapper onClose={onClose} title="Submission Successful!">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-green-500/10 rounded-full mb-4 flex items-center justify-center">
            <Icons.Check className="h-10 w-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            {appName} has been submitted!
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your app has been submitted and your vote has been recorded. The transaction has been confirmed.
          </p>
          <Button
            className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </ModalWrapper>
    );
  }

  const frame = validationResult?.manifest?.frame || validationResult?.manifest?.miniapp;
  const appName = frame?.name || "Untitled App";
  const appDescription = frame?.description || frame?.tagline || "";
  const appIcon = frame?.iconUrl || null;

  const isProcessing = isVoting || isVoteConfirming || isConnecting;
  const hasInsufficientBalance = initialPrice !== undefined && balance !== undefined && balance < initialPrice;

  const canSubmit = 
    !isValidating &&
    validationResult !== null &&
    validationResult.isValid === true &&
    validationResult.hasParticipatedBefore === false &&
    url.length > 0 &&
    !hasInsufficientBalance &&
    !isProcessing;

  // Format balance and price for display
  const balanceFormatted = balance !== undefined
    ? formatUnits(balance, 18)
    : null;
  const initialPriceFormatted = initialPrice !== undefined
    ? formatUnits(initialPrice, 18)
    : null;

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
              disabled={isProcessing}
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

        {/* Balance Status */}
        {address && balanceFormatted !== null && (
          <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">CELO Balance:</span>
              <span className="font-mono text-foreground font-medium">{balanceFormatted} CELO</span>
            </div>
            {initialPriceFormatted && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Required:</span>
                <span className="font-mono text-foreground font-medium">{initialPriceFormatted} CELO</span>
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

        {submissionError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
            {submissionError}
          </div>
        )}

        <Button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full h-12 text-lg bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Connecting Wallet...
            </>
          ) : isVoting ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Confirm in Wallet...
            </>
          ) : isVoteConfirming ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Waiting for confirmations...
            </>
          ) : !isConnected ? (
            "Connect Wallet to Submit"
          ) : (
            initialPriceFormatted ? `Submit for ${initialPriceFormatted} CELO` : "Submit"
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground mt-2">
          (Counts as your first bet)
        </p>
      </div>
    </ModalWrapper>
  );
}
