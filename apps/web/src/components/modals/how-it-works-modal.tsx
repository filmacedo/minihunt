"use client";

import { ModalWrapper } from "./modal-wrapper";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface HowItWorksModalProps {
  onClose: () => void;
}

export function HowItWorksModal({ onClose }: HowItWorksModalProps) {
  return (
    <ModalWrapper onClose={onClose} title="How MiniHunt Works">
      <div className="space-y-6 mb-2">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold flex-shrink-0">
              1
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Bet on MiniApps</h3>
              <p className="text-sm text-muted-foreground">
                Support your favorite apps. Early bets get better odds.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold flex-shrink-0">
              2
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Top 3 Win</h3>
              <p className="text-sm text-muted-foreground">
                At the end of the week, the prize pool is split 60% / 30% / 10%.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold flex-shrink-0">
              3
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Claim Rewards</h3>
              <p className="text-sm text-muted-foreground">
                Winners claim their share of the pool based on their bet size.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Example Scenarios
          </h3>

          <div className="bg-muted/30 p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">
                High Risk
              </span>
              <span className="font-semibold text-sm text-foreground">
                Early bet on underdog
              </span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>You bet 10x on new app for $11</li>
              <li>App wins 3rd place → $450 pool</li>
              <li>You own 40% of bets</li>
              <li className="text-foreground font-semibold">
                You win: $180 (16x return!)
              </li>
            </ul>
          </div>

          <div className="bg-muted/30 p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">
                Low Risk
              </span>
              <span className="font-semibold text-sm text-foreground">
                Spread Strategy
              </span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>You bet on 3 different apps</li>
              <li>Total spent: $15</li>
              <li>2 apps finish top 3</li>
              <li className="text-foreground font-semibold">
                You win: $47 (3x return)
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            FAQ
          </h3>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                What happens to losing bets?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Bets on apps that don&apos;t finish in the top 3 go into the
                prize pool for the winners.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                How are rewards calculated?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Your reward = (Your Bets / Total Winning Bets) * Prize Pool
                Share
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </ModalWrapper>
  );
}
