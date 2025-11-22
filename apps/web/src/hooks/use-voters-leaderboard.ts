import { useState, useEffect, useCallback } from "react";
import { useApi } from "./use-api";
import { WeekData } from "@/lib/types";

export interface VoterEntry {
  fid: string;
  paidAmount: string;
  earningAmount: string;
  user: {
    id: string;
    name: string | null;
    bio: string | null;
    profile_image_url: string | null;
  } | null;
}

interface VotersLeaderboardResponse {
  week: WeekData;
  leaderboard: VoterEntry[];
}

export function useVotersLeaderboard() {
  const { get } = useApi();
  const [leaderboard, setLeaderboard] = useState<VoterEntry[]>([]);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await get("/api/miniapps/voters-leaderboard") as VotersLeaderboardResponse;
      setLeaderboard(data.leaderboard);
      setWeek(data.week);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch voters leaderboard"));
    } finally {
      setIsLoading(false);
    }
  }, [get]);

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

