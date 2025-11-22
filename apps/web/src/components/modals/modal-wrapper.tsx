"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModalWrapperProps {
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function ModalWrapper({ onClose, title, children }: ModalWrapperProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px] rounded-xl overflow-hidden">
        {title && (
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-center text-foreground">
              {title}
            </DialogTitle>
          </DialogHeader>
        )}
        <div className="mt-4 overflow-hidden">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
