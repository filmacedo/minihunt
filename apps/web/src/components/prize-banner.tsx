import { Icons } from "@/components/ui/icons";
import { WeekData } from "@/lib/types";
import { formatUnitsFixed } from "@/lib/utils";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WeekWithIndex } from "@/hooks/use-weeks";

interface PrizeBannerProps {
  week?: WeekData | null;
  weeks?: WeekWithIndex[];
  selectedWeekIndex?: string | null;
  onWeekChange?: (weekIndex: string) => void;
}

export function PrizeBanner({ week, weeks = [], selectedWeekIndex, onWeekChange }: PrizeBannerProps) {
  const timeLeft = useMemo(() => {
    if (!week) return "Ending soon";
    const end = new Date(week.endTime);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return "Ended";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${days}d ${hours}h ${minutes}m`;
  }, [week]);

  // CELO has 18 decimals
  const prizePool = week ? formatUnitsFixed(BigInt(week.prizePool), 18) : "0.00";
  const totalVoters = week ? parseInt(week.totalVoters, 10) : 0;
  const totalUniqueVoters = week ? parseInt(week.totalUniqueVoters, 10) : 0;

  const weekDates = useMemo(() => {
    if (!week) return null;
    const start = new Date(week.startTime);
    const end = new Date(week.endTime);
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, [week]);

  // Find current week index in the weeks array
  const currentWeekIndex = useMemo(() => {
    if (!selectedWeekIndex || !weeks.length) return null;
    return weeks.findIndex((w) => w.weekIndex === selectedWeekIndex);
  }, [weeks, selectedWeekIndex]);

  const canGoPrevious = currentWeekIndex !== null && currentWeekIndex < weeks.length - 1;
  const canGoNext = currentWeekIndex !== null && currentWeekIndex > 0;

  const handlePrevious = () => {
    if (!canGoPrevious || currentWeekIndex === null || !onWeekChange) return;
    const previousWeek = weeks[currentWeekIndex + 1];
    if (previousWeek) {
      onWeekChange(previousWeek.weekIndex);
    }
  };

  const handleNext = () => {
    if (!canGoNext || currentWeekIndex === null || !onWeekChange) return;
    const nextWeek = weeks[currentWeekIndex - 1];
    if (nextWeek) {
      onWeekChange(nextWeek.weekIndex);
    }
  };

  const selectedWeek = useMemo(() => {
    if (!selectedWeekIndex || !weeks.length) return null;
    return weeks.find((w) => w.weekIndex === selectedWeekIndex);
  }, [weeks, selectedWeekIndex]);

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 text-center space-y-4 sm:space-y-6 border-b border-border bg-background">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 sm:h-10 sm:w-10",
            !canGoPrevious && "opacity-30 cursor-not-allowed"
          )}
          onClick={handlePrevious}
          disabled={!canGoPrevious}
        >
          <Icons.ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>

        <div className="flex-1 space-y-4 sm:space-y-6">
          <h1 className="text-lg sm:text-xl leading-tight text-foreground font-semibold px-2">
            Bet on the best miniapp of the week.
          </h1>

          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs sm:text-sm font-semibold uppercase tracking-wide">
              <Icons.Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="whitespace-nowrap">
                {weekDates} Prize Pool
                {selectedWeek && (
                  <span className={cn(
                    "ml-2 px-2 py-0.5 rounded text-[10px]",
                    selectedWeek.hasRewards 
                      ? "bg-[#E1FF00]/20 text-[#E1FF00] dark:text-[#E1FF00]" 
                      : "bg-muted/50"
                  )}>
                    Week {selectedWeek.weekIndex}
                  </span>
                )}
              </span>
            </div>
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight font-mono break-words px-2">
              {prizePool} CELO
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 sm:h-10 sm:w-10",
            !canGoNext && "opacity-30 cursor-not-allowed"
          )}
          onClick={handleNext}
          disabled={!canGoNext}
        >
          <Icons.ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-muted/50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full font-mono">
          <Icons.Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="whitespace-nowrap">{totalUniqueVoters.toLocaleString()} voters</span>
        </div>
        <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-muted/50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full font-mono">
          <Icons.Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="whitespace-nowrap">{totalVoters.toLocaleString()} votes</span>
        </div>
        <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-muted/50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full font-mono">
          <Icons.Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="whitespace-nowrap">Ends in: {timeLeft}</span>
        </div>
      </div>
    </div>
  );
}
