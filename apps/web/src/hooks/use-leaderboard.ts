import { useState, useEffect, useCallback } from "react";
import { useApi } from "./use-api";

export interface MiniApp {
  id: string;
  frameUrl: string;
  frameSignature: string;
  name: string | null;
  description: string | null;
  iconUrl: string | null;
  imageUrl: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  totalVotes: number;
  totalSpentWei: string;
  miniApp: MiniApp;
}

export interface WeekData {
  id: string;
  startTime: string;
  endTime: string;
  totalVoters: string;
  totalUniqueVoters: string;
  prizePool: string;
}

interface LeaderboardResponse {
  timestamp: string;
  week: WeekData;
  leaderboard: LeaderboardEntry[];
}

export function useLeaderboard(timestamp?: string | null) {
  const { get } = useApi();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = timestamp 
        ? `/api/miniapps?timestamp=${encodeURIComponent(timestamp)}`
        : "/api/miniapps";
      const data = await get(url) as LeaderboardResponse;
      setLeaderboard(data.leaderboard);
      setWeek(data.week);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch leaderboard"));
    } finally {
      setIsLoading(false);
    }
  }, [get, timestamp]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    leaderboard,
    week,
    isLoading,
    error,
    refetch: fetchLeaderboard,
  };
}

