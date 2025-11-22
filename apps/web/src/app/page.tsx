"use client";
import { useState } from "react";
import { TopNav } from "@/components/navbar";
import { PrizeBanner } from "@/components/prize-banner";
import { WelcomeBanner } from "@/components/welcome-banner";
import { BettingModal } from "@/components/modals/betting-modal";
import { SubmitAppModal } from "@/components/modals/submit-app-modal";
import { HowItWorksModal } from "@/components/modals/how-it-works-modal";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { useVotersLeaderboard } from "@/hooks/use-voters-leaderboard";
import { MiniApp } from "@/lib/types";
import { formatUSDC } from "@/lib/app-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export default function Home() {
  const { leaderboard: apps, week: appsWeek, isLoading: appsLoading, refetch: refetchApps } = useLeaderboard();
  const { leaderboard: voters, isLoading: votersLoading } = useVotersLeaderboard();
  
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

  return (
    <main className="pb-20 relative min-h-screen">
      <TopNav onOpenModal={handleOpenModal} />
      <WelcomeBanner />
      <PrizeBanner week={appsWeek} />

      {/* Tabs */}
      <div className="sticky top-[61px] bg-background z-30 border-b border-border">
        <div className="grid grid-cols-2 p-1">
          <button
            onClick={() => setActiveTab("apps")}
            className={cn(
              "py-3 text-sm font-semibold border-b-2 transition-colors",
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
              "py-3 text-sm font-semibold border-b-2 transition-colors",
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
      <div className="p-4 space-y-4">
        {activeTab === "apps" ? (
          <div className="space-y-3">
            {appsLoading ? (
              <div className="text-center py-10 text-muted-foreground">Loading MiniApps...</div>
            ) : apps.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No MiniApps submitted this week. Be the first!</div>
            ) : (
              apps.map((entry) => (
                <div
                  key={entry.miniApp.id}
                  className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border shadow-sm h-[72px]"
                >
                  <div className="flex-none w-8 text-center">
                    {entry.rank <= 3 ? (
                      <span className="text-xl">
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground font-mono">
                        #{entry.rank}
                      </span>
                    )}
                  </div>

                  <Avatar className="flex-none w-12 h-12 rounded-lg">
                    <AvatarImage
                      src={entry.miniApp.iconUrl || "/placeholder.svg"}
                      alt={entry.miniApp.name || "App"}
                      className="rounded-lg object-cover"
                    />
                    <AvatarFallback className="rounded-lg bg-muted text-muted-foreground font-semibold">
                      {(entry.miniApp.name || "A").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-base">
                      {entry.miniApp.name || "Untitled App"}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {entry.miniApp.description || entry.miniApp.frameUrl}
                    </p>
                  </div>

                  <div className="flex-none">
                    <button
                      onClick={() => handleOpenModal("betting", entry.miniApp)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 h-12 w-12 rounded-lg border-2 transition-all hover:scale-105 active:scale-95",
                        entry.totalVotes > 0
                          ? "border-foreground/10 bg-foreground/5 text-foreground dark:border-primary/50 dark:bg-primary/10 dark:text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/20"
                      )}
                    >
                      <Icons.ArrowUp className="h-4 w-4" />
                      <span className="text-xs font-semibold leading-none font-mono">
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
              <div className="text-center py-10 text-muted-foreground">Loading Hunters...</div>
            ) : voters.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No votes cast yet this week.</div>
            ) : (
              voters.map((voter, i) => (
                <div
                  key={voter.fid}
                  className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border shadow-sm h-[72px]"
                >
                  <div className="flex-none w-8 text-center">
                    <span className="text-sm font-bold text-muted-foreground font-mono">
                      #{i + 1}
                    </span>
                  </div>

                  <Avatar className="flex-none w-12 h-12">
                    <AvatarFallback className="bg-muted text-muted-foreground font-semibold">
                      {voter.fid.toString().substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-base">
                      FID: {voter.fid}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                       <span className="font-mono">{formatUSDC(voter.paidAmount)}</span> USDC spent
                    </p>
                  </div>

                  <div className="flex-none text-right">
                    <div className="text-sm font-bold text-foreground dark:text-[#E1FF00] font-mono">
                      {BigInt(voter.earningAmount) > 0n ? `+${formatUSDC(voter.earningAmount)}` : "-"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
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
          className="fixed bottom-6 right-6 w-14 h-14 bg-[#E1FF00] text-black rounded-full shadow-lg flex items-center justify-center hover:bg-[#E1FF00]/90 active:scale-95 transition-all z-30"
        >
          <Icons.Plus className="h-6 w-6" />
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
