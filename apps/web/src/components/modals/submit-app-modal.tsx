"use client";

import { ModalWrapper } from "./modal-wrapper";
import { Button } from "@/components/ui/button";

interface SubmitAppModalProps {
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean;
}

export function SubmitAppModal({ onClose, onSuccess, isOpen }: SubmitAppModalProps) {

  if (!isOpen) return null;

  // Show disabled state with message
  return (
    <ModalWrapper onClose={onClose} title="Submissions Temporarily Disabled">
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-yellow-500/10 rounded-full mb-4 flex items-center justify-center">
          <span className="text-4xl">🚧</span>
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          New Features Coming Soon
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          We&apos;re expanding MiniHunt with exciting new features! App submissions are temporarily paused while we work on improvements. Claim functionality remains available.
        </p>
        <Button
          variant="ghost"
          className="w-full h-12 text-lg text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </ModalWrapper>
  );
}
