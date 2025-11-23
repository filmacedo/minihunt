"use client";

import { useState } from "react";
import { useMiniApp } from "@/contexts/miniapp-context";
import { TopNav } from "@/components/navbar";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useUserVotes } from "@/hooks/use-user-votes";
import { formatUnits } from "viem";

// Reuse these modals
import { SubmitAppModal } from "@/components/modals/submit-app-modal";
import { HowItWorksModal } from "@/components/modals/how-it-works-modal";

export default function MyBetsPage() {
  const { context } = useMiniApp();
  const { stats, isLoading } = useUserVotes(context?.user?.fid);
  
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

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
                           {formatUnits(currentSpent, 18)} CELO
                        </span>
                     </div>
                  </div>

                  <div className="pt-4 flex justify-between items-end">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        Total Spent
                      </div>
                      <div className="font-mono text-foreground text-lg">
                        {formatUnits(currentSpent, 18)} CELO
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        Projected Win
                      </div>
                      <div className="font-mono text-foreground text-lg text-[#E1FF00] dark:text-[#E1FF00] text-green-600">
                        {formatUnits(currentEarned, 18)} CELO
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

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
                           {isWinner ? `+${formatUnits(earned, 18)} CELO` : "No Win"}
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
                            <span className="font-mono text-foreground">{formatUnits(spent, 18)} CELO</span>
                         </div>
                         <div className="pt-2 flex justify-between">
                            <span className="text-muted-foreground">Total Earned:</span>
                            <span className="font-mono text-foreground">{formatUnits(earned, 18)} CELO</span>
                         </div>
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
