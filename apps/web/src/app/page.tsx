"use client";
import { useState, useEffect, useMemo } from "react";
import { TopNav } from "@/components/navbar";
import { PrizeBanner } from "@/components/prize-banner";
import { WelcomeBanner } from "@/components/welcome-banner";
import { BettingModal } from "@/components/modals/betting-modal";
import { SubmitAppModal } from "@/components/modals/submit-app-modal";
import { HowItWorksModal } from "@/components/modals/how-it-works-modal";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { useVotersLeaderboard } from "@/hooks/use-voters-leaderboard";
import { useWeeks } from "@/hooks/use-weeks";
import { useMiniApp } from "@/contexts/miniapp-context";
import { MiniApp } from "@/lib/types";
import { formatUnitsFixed } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export default function Home() {
  const { context } = useMiniApp();
  const userFid = context?.user?.fid;

  // Fetch all weeks
  const { weeks, currentWeekIndex } = useWeeks(userFid);

  // State for selected week - initialize with current week index if available
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<string | null>(currentWeekIndex || null);

  // Set initial selected week to current week (update when currentWeekIndex becomes available)
  useEffect(() => {
    if (currentWeekIndex && !selectedWeekIndex) {
      setSelectedWeekIndex(currentWeekIndex);
    }
    // Also update if currentWeekIndex changes and we don't have a selection yet
    if (currentWeekIndex && selectedWeekIndex === null) {
      setSelectedWeekIndex(currentWeekIndex);
    }
  }, [currentWeekIndex, selectedWeekIndex]);

  // Ensure we default to current week when weeks load
  useEffect(() => {
    if (weeks.length > 0 && currentWeekIndex && !selectedWeekIndex) {
      setSelectedWeekIndex(currentWeekIndex);
    }
    // Also update if selected week doesn't exist in weeks array
    if (weeks.length > 0 && selectedWeekIndex) {
      const found = weeks.find((w) => w.weekIndex === selectedWeekIndex);
      if (!found && currentWeekIndex) {
        setSelectedWeekIndex(currentWeekIndex);
      }
    }
  }, [weeks, currentWeekIndex, selectedWeekIndex]);

  // Get selected week's start time for leaderboard
  // Default to current week if no selection or if selected week not found
  const selectedWeek = useMemo(() => {
    if (!weeks.length) return null;
    
    // If we have a selected week index, try to find it
    if (selectedWeekIndex) {
      const found = weeks.find((w) => w.weekIndex === selectedWeekIndex);
      if (found) return found;
    }
    
    // Otherwise, default to current week (use isCurrentWeek flag from API)
    const currentWeek = weeks.find((w) => w.isCurrentWeek);
    if (currentWeek) return currentWeek;
    
    // Fallback: try to find by currentWeekIndex if isCurrentWeek flag is missing
    if (currentWeekIndex) {
      const weekByIndex = weeks.find((w) => w.weekIndex === currentWeekIndex);
      if (weekByIndex) return weekByIndex;
    }
    
    // Last resort: first week (most recent)
    return weeks[0] || null;
  }, [weeks, selectedWeekIndex, currentWeekIndex]);

  const timestampForLeaderboard = selectedWeek?.startTime || null;

  const {
    leaderboard: apps,
    week: appsWeek,
    isLoading: appsLoading,
    refetch: refetchApps,
  } = useLeaderboard(timestampForLeaderboard);
  const { leaderboard: voters, isLoading: votersLoading } =
    useVotersLeaderboard(timestampForLeaderboard);

  const [activeTab, setActiveTab] = useState<"apps" | "hunters">("apps");

  // Modal State
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<MiniApp | null>(null);

  const handleOpenModal = (modal: string, app?: MiniApp) => {
    setModalOpen(modal);
    if (app) setSelectedApp(app);
  };

  const handleCloseModal = () => {
    setModalOpen(null);
    setSelectedApp(null);
  };

  const handleBetSuccess = () => {
    refetchApps();
    // Add toast notification here later
    handleCloseModal();
  };

  const handleSubmitSuccess = () => {
    refetchApps();
    // Add toast notification here later
    handleCloseModal();
  };

  const handleWeekChange = (weekIndex: string) => {
    setSelectedWeekIndex(weekIndex);
  };

  return (
    <main className="pb-20 relative min-h-screen">
      <TopNav onOpenModal={handleOpenModal} />
      <WelcomeBanner />
      <PrizeBanner 
        week={appsWeek} 
        weeks={weeks}
        selectedWeekIndex={selectedWeekIndex}
        onWeekChange={handleWeekChange}
      />

      {/* Tabs */}
      <div className="sticky top-[57px] sm:top-[61px] bg-background z-30 border-b border-border">
        <div className="grid grid-cols-2">
          <button
            onClick={() => setActiveTab("apps")}
            className={cn(
              "py-2.5 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors",
              activeTab === "apps"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            MiniApps
          </button>
          <button
            onClick={() => setActiveTab("hunters")}
            className={cn(
              "py-2.5 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors",
              activeTab === "hunters"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Hunters
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-4 space-y-3 sm:space-y-4">
        {activeTab === "apps" ? (
          <div className="space-y-3">
            {appsLoading ? (
              <div className="text-center py-10 text-muted-foreground">
                Loading MiniApps...
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No MiniApps submitted this week. Be the first!
              </div>
            ) : (
              apps.map((entry) => (
                <div
                  key={entry.miniApp.id}
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-card rounded-xl border border-border shadow-sm min-h-[64px] sm:h-[72px]"
                >
                  <div className="flex-none w-6 sm:w-8 text-center">
                    {entry.rank <= 3 ? (
                      <span className="text-lg sm:text-xl">
                        {entry.rank === 1
                          ? "🥇"
                          : entry.rank === 2
                          ? "🥈"
                          : "🥉"}
                      </span>
                    ) : (
                      <span className="text-xs sm:text-sm font-bold text-muted-foreground font-mono">
                        #{entry.rank}
                      </span>
                    )}
                  </div>

                  <Avatar className="flex-none w-10 h-10 sm:w-12 sm:h-12 rounded-lg">
                    <AvatarImage
                      src={entry.miniApp.iconUrl || "/placeholder.svg"}
                      alt={entry.miniApp.name || "App"}
                      className="rounded-lg object-cover"
                    />
                    <AvatarFallback className="rounded-lg bg-muted text-muted-foreground font-semibold text-xs sm:text-sm">
                      {(entry.miniApp.name || "A")
                        .substring(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
                      {entry.miniApp.name || "Untitled App"}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {entry.miniApp.description || entry.miniApp.frameUrl}
                    </p>
                  </div>

                  <div className="flex-none">
                    <button
                      onClick={() => handleOpenModal("betting", entry.miniApp)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 h-10 w-10 sm:h-12 sm:w-12 rounded-lg border-2 transition-all hover:scale-105 active:scale-95",
                        entry.totalVotes > 0
                          ? "border-foreground/10 bg-foreground/5 text-foreground dark:border-primary/50 dark:bg-primary/10 dark:text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/20"
                      )}
                    >
                      <Icons.ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="text-[10px] sm:text-xs font-semibold leading-none font-mono">
                        {entry.totalVotes}
                      </span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {votersLoading ? (
              <div className="text-center py-10 text-muted-foreground">
                Loading Hunters...
              </div>
            ) : voters.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No votes cast yet this week.
              </div>
            ) : (
              voters.map((voter, i) => (
                <div
                  key={voter.fid}
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-card rounded-xl border border-border shadow-sm min-h-[64px] sm:h-[72px] w-full"
                >
                  <div className="flex-none w-6 sm:w-8 text-center">
                    <span className="text-xs sm:text-sm font-bold text-muted-foreground font-mono">
                      #{i + 1}
                    </span>
                  </div>

                  <Avatar className="flex-none w-10 h-10 sm:w-12 sm:h-12">
                    <AvatarImage
                      src={voter.user?.profile_image_url || undefined}
                      alt={voter.user?.name || `FID ${voter.fid}`}
                    />
                    <AvatarFallback className="bg-muted text-muted-foreground font-semibold text-xs sm:text-sm">
                      {voter.user?.name
                        ? voter.user.name.substring(0, 2).toUpperCase()
                        : voter.fid.toString().substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
                      {voter.user?.name || `FID: ${voter.fid}`}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {voter.user?.bio || (
                        <span className="font-mono">
                          {formatUnitsFixed(BigInt(voter.paidAmount), 18)} CELO spent
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex-none text-right">
                    <div className="text-xs sm:text-sm font-bold text-foreground dark:text-[#E1FF00] font-mono">
                      {BigInt(voter.earningAmount) > 0n
                        ? `+${formatUnitsFixed(BigInt(voter.earningAmount), 18)}`
                        : "-"}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground">
                      Est. win
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      {activeTab === "apps" && (
        <button
          onClick={() => handleOpenModal("submit")}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 bg-[#E1FF00] text-black rounded-full shadow-lg flex items-center justify-center hover:bg-[#E1FF00]/90 active:scale-95 transition-all z-30"
        >
          <Icons.Plus className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {/* Modals */}
      {modalOpen === "betting" && selectedApp && (
        <BettingModal
          app={selectedApp}
          onClose={handleCloseModal}
          onSuccess={handleBetSuccess}
          isOpen={true} // Added to satisfy my previous interface, though stashed one didn't have it. I'll need to update BettingModal props match.
        />
      )}

      {modalOpen === "submit" && (
        <SubmitAppModal
          onClose={handleCloseModal}
          onSuccess={handleSubmitSuccess}
          isOpen={true}
        />
      )}

      {modalOpen === "how-it-works" && (
        <HowItWorksModal onClose={handleCloseModal} />
      )}
    </main>
  );
}
