"use client";

import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface TopNavProps {
  onOpenModal?: (modal: string) => void;
}

export function TopNav({ onOpenModal }: TopNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // Initialize theme from html class or local storage
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-40">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight flex items-center gap-2"
        >
          <span>MiniHunt</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Icons.Menu className="h-5 w-5" />
        </Button>
      </header>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right">
          <SheetHeader className="text-left">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 pt-8">
            <Link
              href="/"
              className={cn(
                "px-4 py-3 rounded-md text-sm font-semibold transition-colors hover:bg-muted/50",
                pathname === "/" && "bg-muted"
              )}
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/my-bets"
              className={cn(
                "px-4 py-3 rounded-md text-sm font-semibold transition-colors hover:bg-muted/50",
                pathname === "/my-bets" && "bg-muted"
              )}
              onClick={() => setIsOpen(false)}
            >
              My Bets
            </Link>

            {onOpenModal && (
              <>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenModal("submit");
                  }}
                  className="px-4 py-3 rounded-md text-sm font-semibold transition-colors hover:bg-muted/50 text-left"
                >
                  Submit MiniApp
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenModal("how-it-works");
                  }}
                  className="px-4 py-3 rounded-md text-sm font-semibold transition-colors hover:bg-muted/50 text-left"
                >
                  How It Works
                </button>
              </>
            )}

            <button
              onClick={toggleTheme}
              className="px-4 py-3 rounded-md text-sm font-semibold transition-colors hover:bg-muted/50 text-left flex items-center justify-between"
            >
              <span>Theme</span>
              <span className="text-xs text-muted-foreground">
                {theme === "light" ? "Light" : "Dark"}
              </span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
