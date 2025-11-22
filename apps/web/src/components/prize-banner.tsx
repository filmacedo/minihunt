import { Icons } from "@/components/ui/icons";

export function PrizeBanner() {
  return (
    <div className="px-4 py-8 text-center space-y-6 border-b border-border bg-background">
      <h1 className="text-xl leading-tight text-foreground font-semibold">
        Bet on the best miniapp of the week.
      </h1>

      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm font-semibold uppercase tracking-wide">
          <Icons.Trophy className="w-4 h-4" />
          <span>Week 12 Prize Pool</span>
        </div>

        <div className="text-5xl font-bold text-foreground tracking-tight font-mono">
          $12,847
        </div>
      </div>

      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full font-mono">
        <Icons.Timer className="w-4 h-4" />
        <span>Ends in: 3d 14h 22m</span>
      </div>
    </div>
  );
}
