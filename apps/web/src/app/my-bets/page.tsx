"use client";

import { useState, useEffect, useMemo } from "react";
import { useMiniApp } from "@/contexts/miniapp-context";
import { TopNav } from "@/components/navbar";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserVotes } from "@/hooks/use-user-votes";
import { formatUnitsFixed } from "@/lib/utils";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useConnect } from "wagmi";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { useApi } from "@/hooks/use-api";

// Reuse these modals
import { SubmitAppModal } from "@/components/modals/submit-app-modal";
import { HowItWorksModal } from "@/components/modals/how-it-works-modal";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS as `0x${string}`;

interface ClaimButtonProps {
  week: {
    weekId: string;
    weekIndex: string;
    isFinalized: boolean;
    isClaimed: boolean;
    claimedAmount: string | null;
    claimedAt: string | null;
    deadline: string;
    isWithinDeadline: boolean;
    daysUntilDeadline: number | null;
  };
  earned: bigint;
  isClaiming: boolean;
  onClaimStart: () => void;
  onClaimSuccess: () => void;
  onClaimError: () => void;
}

function ClaimButton({ week, earned, isClaiming, onClaimStart, onClaimSuccess, onClaimError }: ClaimButtonProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { context } = useMiniApp();
  const { post } = useApi();
  const [claimError, setClaimError] = useState<string | null>(null);

  const { 
    data: claimHash, 
    isPending: isWriting, 
    writeContract: writeClaim,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { 
    isLoading: isConfirming, 
    isSuccess: isClaimSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: claimHash,
    confirmations: 3,
  });

  // Clear error when starting a new claim
  useEffect(() => {
    if (isWriting) {
      setClaimError(null);
    }
  }, [isWriting]);

  // Handle successful claim - call API to track claim in database
  useEffect(() => {
    if (isClaimSuccess && claimHash && context?.user?.fid) {
      // Call API to track claim in database
      post("/api/miniapps/claim", {
        tx_hash: claimHash,
        fid: context.user.fid,
      })
        .then(() => {
          console.log("Claim tracked successfully");
          onClaimSuccess();
          setClaimError(null);
        })
        .catch((err) => {
          console.error("Failed to track claim:", err);
          // Still call onClaimSuccess to refresh UI, even if API call fails
          // The claim was successful on-chain, we just couldn't track it
          onClaimSuccess();
          setClaimError(null);
        });
    }
  }, [isClaimSuccess, claimHash, context?.user?.fid, post, onClaimSuccess]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      const errorMessage = writeError.message || "Failed to initiate claim transaction";
      setClaimError(errorMessage);
      console.error("Claim write error:", writeError);
      onClaimError();
    }
  }, [writeError, onClaimError]);

  // Handle receipt errors (transaction failed after being sent)
  useEffect(() => {
    if (receiptError) {
      const errorMessage = receiptError.message || "Transaction failed";
      setClaimError(errorMessage);
      console.error("Claim receipt error:", receiptError);
      onClaimError();
    }
  }, [receiptError, onClaimError]);

  const handleClaim = () => {
    if (!isConnected) {
      const connector = connectors[0];
      if (connector) {
        connect({ connector });
      }
      return;
    }

    if (!address) {
      return;
    }

    if (week.isClaimed) {
      return;
    }

    if (!week.isWithinDeadline) {
      return;
    }

    setClaimError(null);
    onClaimStart();
    try {
      writeClaim({
        address: CONTRACT_ADDRESS,
        abi: MINI_APP_WEEKLY_BETS_ABI,
        functionName: 'claim',
        args: [BigInt(week.weekIndex)],
        chainId: 42220,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit claim";
      setClaimError(errorMessage);
      console.error("Claim submission error:", error);
      onClaimError();
    }
  };

  const isProcessing = isWriting || isConfirming || isClaiming;
  // Allow claiming if user has earnings, not already claimed, and within deadline
  // Contract will handle finalization (first claim can finalize the week)
  const canClaim = !week.isClaimed && week.isWithinDeadline && earned > 0n && !claimError;

  // Format deadline countdown
  const deadlineText = useMemo(() => {
    if (!week.isWithinDeadline) return "Claim expired";
    if (week.daysUntilDeadline === null) return "Claim available";
    if (week.daysUntilDeadline === 0) return "Expires today";
    if (week.daysUntilDeadline === 1) return "Expires tomorrow";
    return `${week.daysUntilDeadline} days left`;
  }, [week.isWithinDeadline, week.daysUntilDeadline]);

  return (
    <div className="pt-4 space-y-2">
      <div className="pt-2 border-t border-border/50">
        {week.isClaimed ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status:</span>
              <span className="text-sm font-semibold text-muted-foreground">Claimed</span>
            </div>
            {week.claimedAmount && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Amount Claimed:</span>
                <span className="text-sm font-semibold text-[#E1FF00] dark:text-[#E1FF00] font-mono">
                  {formatUnitsFixed(BigInt(week.claimedAmount), 18)} CELO
                </span>
              </div>
            )}
            {week.claimedAt && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Claimed on:</span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {new Date(week.claimedAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </div>
            )}
            <Button
              disabled
              className="w-full h-10 text-sm bg-muted text-muted-foreground font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Already Claimed
            </Button>
          </div>
        ) : !week.isWithinDeadline ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status:</span>
              <span className="text-sm font-semibold text-red-500">Claim expired</span>
            </div>
            <Button
              disabled
              className="w-full h-10 text-sm bg-muted text-muted-foreground font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Claim Expired
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Claimable:</span>
              <span className="text-sm font-semibold text-[#E1FF00] dark:text-[#E1FF00] font-mono">
                {formatUnitsFixed(earned, 18)} CELO
              </span>
            </div>
            {week.daysUntilDeadline !== null && week.daysUntilDeadline <= 14 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Deadline:</span>
                <span className={cn(
                  "text-xs font-semibold",
                  week.daysUntilDeadline <= 3 ? "text-red-500" : 
                  week.daysUntilDeadline <= 7 ? "text-orange-500" : 
                  "text-yellow-500"
                )}>
                  {deadlineText}
                </span>
              </div>
            )}
            {claimHash && (
              <div className="text-xs text-muted-foreground">
                Transaction: {claimHash.slice(0, 10)}...{claimHash.slice(-8)}
              </div>
            )}
            {claimError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-500">
                <div className="flex items-center gap-2">
                  <Icons.Alert className="h-3 w-3" />
                  <span>{claimError}</span>
                </div>
                <button
                  onClick={() => {
                    setClaimError(null);
                    resetWrite();
                  }}
                  className="mt-1 text-red-400 hover:text-red-300 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            <Button
              onClick={handleClaim}
              disabled={!canClaim || isProcessing || !isConnected}
              className="w-full h-10 text-sm bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Icons.Spinner className="h-4 w-4 animate-spin" />
                  {isWriting ? "Confirming..." : isConfirming ? "Processing..." : "Claiming..."}
                </span>
              ) : !isConnected ? (
                "Connect Wallet"
              ) : (
                `Claim ${formatUnitsFixed(earned, 18)} CELO`
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format week date range
function formatWeekDateRange(startTime: string, endTime: string): string {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startFormatted} - ${endFormatted}`;
}

export default function MyBetsPage() {
  const { context } = useMiniApp();
  const { stats, isLoading, refetch, error } = useUserVotes(context?.user?.fid);
  
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [claimingWeek, setClaimingWeek] = useState<string | null>(null);

  // Debug logging
  useEffect(() => {
    if (error) {
      console.error("Error loading user votes:", error);
    }
    if (context?.user?.fid) {
      console.log("FID:", context.user.fid);
    } else {
      console.warn("No FID found in context");
    }
    if (stats.length > 0) {
      console.log("Stats loaded:", stats);
    }
  }, [error, context?.user?.fid, stats]);

  const handleOpenModal = (modal: string) => setModalOpen(modal);
  const handleCloseModal = () => {
    setModalOpen(null);
  };

  const toggleWeek = (id: string) => {
    setExpandedWeek(expandedWeek === id ? null : id);
  };

  const currentWeekStat = stats.find(s => s.isCurrentWeek);
  const pastWeeks = stats.filter(s => !s.isCurrentWeek);

  const currentSpent = currentWeekStat ? BigInt(currentWeekStat.spent) : 0n;
  const currentEarned = currentWeekStat ? BigInt(currentWeekStat.earned) : 0n; // Projected

  // Check if user has any earnings (current or past weeks)
  const hasEarnings = currentEarned > 0n || pastWeeks.some(week => BigInt(week.earned) > 0n);
  
  // Calculate total claimable amount from past weeks only (current week is projected)
  const totalClaimable = pastWeeks.reduce((sum, week) => {
    const earned = BigInt(week.earned);
    return sum + (earned > 0n ? earned : 0n);
  }, 0n);

  return (
    <main className="pb-20 relative min-h-screen bg-muted/10">
      <TopNav onOpenModal={handleOpenModal} />

      <div className="p-4 space-y-8">
        {/* Current Week Section */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Current Week
          </h2>
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b border-border">
              <div className="font-semibold text-foreground">
                {isLoading ? "Loading..." : currentWeekStat ? formatWeekDateRange(currentWeekStat.startTime, currentWeekStat.endTime) : "No week data"}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {error ? (
                <div className="text-center text-red-500 py-4">Error: {error.message}</div>
              ) : isLoading ? (
                <div className="text-center text-muted-foreground py-4">Loading stats...</div>
              ) : !currentWeekStat ? (
                <div className="text-center text-muted-foreground py-4">No current week data available</div>
              ) : (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
                     <div className="flex flex-col">
                       <span className="font-semibold text-foreground">Total Bets</span>
                       <span className="text-xs text-muted-foreground">Across all apps</span>
                     </div>
                     <div className="text-right">
                        <span className="font-mono text-foreground">
                           {formatUnitsFixed(currentSpent, 18)} CELO
                        </span>
                     </div>
                  </div>

                  <div className="pt-4 flex justify-between items-end">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        Total Spent
                      </div>
                      <div className="font-mono text-foreground text-lg">
                        {formatUnitsFixed(currentSpent, 18)} CELO
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        Projected Win
                      </div>
                      <div className="font-mono text-foreground text-lg text-[#E1FF00] dark:text-[#E1FF00] text-green-600">
                        {formatUnitsFixed(currentEarned, 18)} CELO
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <div className="h-px bg-border" />

        {/* Claim Button Section */}
        {hasEarnings && (
          <section>
            <div className="bg-card rounded-xl border border-border shadow-sm p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Claim Earnings
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {totalClaimable > 0n 
                      ? `You have ${formatUnitsFixed(totalClaimable, 18)} CELO available to claim from past weeks.`
                      : currentEarned > 0n
                      ? `You have ${formatUnitsFixed(currentEarned, 18)} CELO in projected earnings from the current week.`
                      : "You have earnings available to claim."}
                  </p>
                </div>
                <Button
                  disabled
                  className="w-full sm:w-auto h-11 px-6 text-base bg-[#E1FF00] hover:bg-[#E1FF00]/90 text-black font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Claim
                </Button>
              </div>
            </div>
          </section>
        )}

        <div className="h-px bg-border" />

        {/* Past Weeks Section */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Past Weeks
          </h2>
          <div className="space-y-3">
            {error ? (
              <div className="text-center text-red-500 py-4 bg-card rounded-xl border border-red-500/20">
                Error loading weeks: {error.message}
              </div>
            ) : isLoading ? (
               <div className="text-center text-muted-foreground py-4">Loading history...</div>
            ) : pastWeeks.length === 0 ? (
               <div className="text-center text-muted-foreground py-4 bg-card rounded-xl border border-dashed border-border">
                 No past bets found.
               </div>
            ) : (
              pastWeeks.map((week) => {
                const isExpanded = expandedWeek === week.weekId;
                const spent = BigInt(week.spent);
                const earned = BigInt(week.earned);
                const isWinner = earned > spent;

                return (
                  <div
                    key={week.weekId}
                    className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => toggleWeek(week.weekId)}
                      className="w-full flex items-center justify-between px-4 py-4 bg-card hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex flex-col items-start gap-1">
                        <div className="text-foreground text-base font-semibold">
                          {formatWeekDateRange(week.startTime, week.endTime)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className={cn("font-mono text-sm", isWinner ? "text-[#E1FF00] dark:text-[#E1FF00] text-green-600" : "text-muted-foreground")}>
                           {isWinner ? `+${formatUnitsFixed(earned, 18)} CELO` : "No Win"}
                         </span>
                         <Icons.ChevronRight
                           className={cn(
                             "h-4 w-4 text-muted-foreground/50 transition-transform",
                             isExpanded && "rotate-90"
                           )}
                         />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0">
                         <div className="pt-4 border-t border-border/50 flex justify-between">
                            <span className="text-muted-foreground">Total Spent:</span>
                            <span className="font-mono text-foreground">{formatUnitsFixed(spent, 18)} CELO</span>
                         </div>
                         <div className="pt-2 flex justify-between">
                            <span className="text-muted-foreground">Total Earned:</span>
                            <span className="font-mono text-foreground">{formatUnitsFixed(earned, 18)} CELO</span>
                         </div>
                         
                         {/* Claim Button Section */}
                         {earned > 0n && (
                           <ClaimButton
                             week={week}
                             earned={earned}
                             isClaiming={claimingWeek === week.weekId}
                             onClaimStart={() => setClaimingWeek(week.weekId)}
                             onClaimSuccess={() => {
                               setClaimingWeek(null);
                               refetch();
                             }}
                             onClaimError={() => setClaimingWeek(null)}
                           />
                         )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      {modalOpen === "submit" && (
        <SubmitAppModal 
          onClose={handleCloseModal}
          onSuccess={() => handleCloseModal()} // Simple close for now
          isOpen={true}
        />
      )}
      {modalOpen === "how-it-works" && (
        <HowItWorksModal onClose={handleCloseModal} />
      )}
    </main>
  );
}
