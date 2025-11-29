"use client";

import { useState, useEffect, useMemo } from "react";
import { useMiniApp } from "@/contexts/miniapp-context";
import { TopNav } from "@/components/navbar";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserVotes } from "@/hooks/use-user-votes";
import { formatUnitsFixed } from "@/lib/utils";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useConnect, connectors } from "wagmi";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";

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
  const { connect } = useConnect();

  const { 
    data: claimHash, 
    isPending: isWriting, 
    writeContract: writeClaim,
    error: claimError,
  } = useWriteContract();

  const { 
    isLoading: isConfirming, 
    isSuccess: isClaimSuccess,
  } = useWaitForTransactionReceipt({
    hash: claimHash,
    confirmations: 3,
  });

  useEffect(() => {
    if (isClaimSuccess) {
      onClaimSuccess();
    }
  }, [isClaimSuccess, onClaimSuccess]);

  useEffect(() => {
    if (claimError) {
      console.error("Claim error:", claimError);
      onClaimError();
    }
  }, [claimError, onClaimError]);

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

    if (!week.isFinalized) {
      return;
    }

    if (week.isClaimed) {
      return;
    }

    if (!week.isWithinDeadline) {
      return;
    }

    onClaimStart();
    writeClaim({
      address: CONTRACT_ADDRESS,
      abi: MINI_APP_WEEKLY_BETS_ABI,
      functionName: 'claim',
      args: [BigInt(week.weekIndex)],
      chainId: 42220,
    });
  };

  const isProcessing = isWriting || isConfirming || isClaiming;
  const canClaim = week.isFinalized && !week.isClaimed && week.isWithinDeadline && earned > 0n;

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
            <Button
              disabled
              className="w-full h-10 text-sm bg-muted text-muted-foreground font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Already Claimed
            </Button>
          </div>
        ) : !week.isFinalized ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status:</span>
              <span className="text-sm font-semibold text-muted-foreground">Week not finalized</span>
            </div>
            <Button
              disabled
              className="w-full h-10 text-sm bg-muted text-muted-foreground font-semibold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Not Finalized
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
            {week.daysUntilDeadline !== null && week.daysUntilDeadline <= 7 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Deadline:</span>
                <span className="text-xs font-semibold text-orange-500">{deadlineText}</span>
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

export default function MyBetsPage() {
  const { context } = useMiniApp();
  const { stats, isLoading, refetch } = useUserVotes(context?.user?.fid);
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [claimingWeek, setClaimingWeek] = useState<string | null>(null);

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
                Week {currentWeekStat?.weekId || "Loading..."}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {isLoading ? (
                <div className="text-center text-muted-foreground py-4">Loading stats...</div>
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
            {isLoading ? (
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
                          Week {week.weekId}
                        </div>
                         <div className="text-xs text-muted-foreground">
                           {new Date(week.startTime).toLocaleDateString()}
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
