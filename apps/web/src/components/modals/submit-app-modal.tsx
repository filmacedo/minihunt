"use client";

import { useState, useEffect } from "react";
import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { useApi } from "@/hooks/use-api";
import { useMiniApp } from "@/contexts/miniapp-context";
import { type FarcasterManifest, normalizeUrl } from "@/lib/miniapp-utils";
import { calculateAppHash } from "@/lib/app-utils";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import ERC20_ABI from "@/lib/abis/erc20.json";
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

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`;
const APPROVAL_AMOUNT = parseUnits("100", 6); // Approve 100 USDC for multiple votes

export function SubmitAppModal({ onClose, onSuccess, isOpen }: SubmitAppModalProps) {
  const [url, setUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  
  const { context } = useMiniApp();
  const { post } = useApi();
  const { address } = useAccount();
  
  // Read contract hooks - fetch USDC address, balance, allowance, decimals, initialPrice
  const { data: usdcAddress } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MINI_APP_WEEKLY_BETS_ABI,
    functionName: "cUSD",
    query: {
      enabled: isOpen && !!CONTRACT_ADDRESS,
    },
  }) as { data: `0x${string}` | undefined };

  const { data: tokenDecimals } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: {
      enabled: isOpen && !!usdcAddress,
    },
  }) as { data: number | undefined };

  const { data: balance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: isOpen && !!usdcAddress && !!address,
    },
  }) as { data: bigint | undefined };

  const { data: allowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && CONTRACT_ADDRESS ? [address, CONTRACT_ADDRESS] : undefined,
    query: {
      enabled: isOpen && !!usdcAddress && !!address && !!CONTRACT_ADDRESS,
    },
  }) as { data: bigint | undefined };

  const { data: initialPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MINI_APP_WEEKLY_BETS_ABI,
    functionName: "initialPrice",
    query: {
      enabled: isOpen && !!CONTRACT_ADDRESS,
    },
  }) as { data: bigint | undefined };

  // Calculate if approval is needed
  const needsApproval = initialPrice !== undefined && allowance !== undefined && allowance < initialPrice;

  // Approval transaction hooks
  const { 
    data: approvalHash, 
    isPending: isApproving, 
    writeContract: writeApproval,
    error: approvalError,
  } = useWriteContract();

  const { 
    isLoading: isApprovalConfirming, 
    isSuccess: isApprovalSuccess 
  } = useWaitForTransactionReceipt({
    hash: approvalHash,
  });

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


  // Handle approval success - proceed to vote
  useEffect(() => {
    if (isApprovalSuccess && needsApproval && url && validationResult?.manifest && usdcAddress) {
      // Approval confirmed, now proceed with vote
      const normalizedUrl = normalizeUrl(url);
      const appHash = calculateAppHash(url);

      // Save metadata (optimistic)
      const frame = validationResult.manifest.frame || validationResult.manifest.miniapp;
      if (frame) {
        post("/api/miniapps", {
          frameUrl: url,
          frameSignature: appHash,
          name: frame.name || null,
          description: frame.description || frame.tagline || null,
          iconUrl: frame.iconUrl || null,
        }).catch((err) => {
          console.warn("Metadata save failed", err);
        });
      }

      // Submit to blockchain
      writeVote({
        address: CONTRACT_ADDRESS,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: "vote",
        args: [appHash as `0x${string}`, normalizedUrl],
      });
    }
  }, [isApprovalSuccess, needsApproval, url, validationResult, usdcAddress, writeVote, post]);

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
    if (!url || !validationResult?.manifest || !usdcAddress) return;
    
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

      // Step 2: Submit to blockchain
      writeVote({
        address: CONTRACT_ADDRESS,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: "vote",
        args: [appHash, normalizedUrl],
        // NO value parameter - contract uses ERC20 transfer
      });
    } catch (error) {
      console.error("Vote failed:", error);
      setSubmissionError(error instanceof Error ? error.message : "Failed to submit vote");
    }
  };

  const handleSubmit = async () => {
    if (!url || !validationResult?.manifest || !usdcAddress || !address) return;
    
    setSubmissionError(null);

    // Check balance
    if (initialPrice !== undefined && balance !== undefined && balance < initialPrice) {
      const balanceFormatted = tokenDecimals !== undefined
        ? formatUnits(balance, tokenDecimals)
        : balance.toString();
      const requiredFormatted = tokenDecimals !== undefined
        ? formatUnits(initialPrice, tokenDecimals)
        : initialPrice.toString();
      setSubmissionError(
        `Insufficient USDC balance. You have ${balanceFormatted} USDC, but need ${requiredFormatted} USDC.`
      );
      return;
    }

    // Check allowance and approve if needed
    if (needsApproval && initialPrice) {
      try {
        writeApproval({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACT_ADDRESS, APPROVAL_AMOUNT],
        });
      } catch (error) {
        console.error("Approval failed:", error);
        setSubmissionError(error instanceof Error ? error.message : "Failed to approve USDC");
      }
    } else {
      // Already approved, proceed with vote
      handleVote();
    }
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
        onSuccess();
      });
    }
  }, [isVoteSuccess, voteHash, context, post, onSuccess]);

  // Update error state from transaction errors
  useEffect(() => {
    if (approvalError) {
      setSubmissionError(approvalError.message || "Approval transaction failed");
    }
  }, [approvalError]);

  useEffect(() => {
    if (voteError) {
      setSubmissionError(voteError.message || "Vote transaction failed");
    }
  }, [voteError]);

  if (!isOpen) return null;

  const frame = validationResult?.manifest?.frame || validationResult?.manifest?.miniapp;
  const appName = frame?.name || "Untitled App";
  const appDescription = frame?.description || frame?.tagline || "";
  const appIcon = frame?.iconUrl || null;

  const isProcessing = isApproving || isApprovalConfirming || isVoting || isVoteConfirming;
  const hasInsufficientBalance = initialPrice !== undefined && balance !== undefined && balance < initialPrice;

  const canSubmit = 
    !isValidating &&
    validationResult !== null &&
    validationResult.isValid === true &&
    validationResult.hasParticipatedBefore === false &&
    url.length > 0 &&
    !hasInsufficientBalance &&
    !isProcessing;

  // Format balance and allowance for display
  const balanceFormatted = balance !== undefined && tokenDecimals !== undefined
    ? formatUnits(balance, tokenDecimals)
    : null;
  const allowanceFormatted = allowance !== undefined && tokenDecimals !== undefined
    ? formatUnits(allowance, tokenDecimals)
    : null;
  const initialPriceFormatted = initialPrice !== undefined && tokenDecimals !== undefined
    ? formatUnits(initialPrice, tokenDecimals)
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

        {/* Balance and Allowance Status */}
        {address && balanceFormatted !== null && (
          <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">USDC Balance:</span>
              <span className="font-mono text-foreground font-medium">{balanceFormatted} USDC</span>
            </div>
            {allowanceFormatted !== null && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Allowance:</span>
                <span className="font-mono text-foreground font-medium">{allowanceFormatted} USDC</span>
              </div>
            )}
            {initialPriceFormatted && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Required:</span>
                <span className="font-mono text-foreground font-medium">{initialPriceFormatted} USDC</span>
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
          {isApproving || isApprovalConfirming ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Approving USDC...
            </>
          ) : isVoting || isVoteConfirming ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
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
