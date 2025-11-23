import { Icons } from "@/components/ui/icons";
import { WeekData } from "@/lib/types";
import { formatUnits } from "viem";
import { useMemo } from "react";

interface PrizeBannerProps {
  week?: WeekData | null;
}

export function PrizeBanner({ week }: PrizeBannerProps) {
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
  const prizePool = week ? formatUnits(BigInt(week.prizePool), 18) : "0";
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

  return (
    <div className="px-4 py-8 text-center space-y-6 border-b border-border bg-background">
      <h1 className="text-xl leading-tight text-foreground font-semibold">
        Bet on the best miniapp of the week.
      </h1>

      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm font-semibold uppercase tracking-wide">
          <Icons.Trophy className="w-4 h-4" />
          <span>{weekDates} Prize Pool</span>
        </div>
        <div className="text-5xl font-bold text-foreground tracking-tight font-mono">
          {prizePool} CELO
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground overflow-x-auto -mx-4 px-4">
        <div className="inline-flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full font-mono flex-shrink-0">
          <Icons.Users className="w-4 h-4" />
          <span>{totalUniqueVoters.toLocaleString()} voters</span>
        </div>
        <div className="inline-flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full font-mono flex-shrink-0">
          <Icons.Users className="w-4 h-4" />
          <span>{totalVoters.toLocaleString()} votes</span>
        </div>
        <div className="inline-flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full font-mono flex-shrink-0">
          <Icons.Timer className="w-4 h-4" />
          <span>Ends in: {timeLeft}</span>
        </div>
      </div>
    </div>
  );
}
