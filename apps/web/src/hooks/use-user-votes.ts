import { useState, useEffect, useCallback } from "react";
import { useApi } from "./use-api";

export interface WeekStat {
  weekId: string;
  weekIndex: string;
  startTime: string;
  endTime: string;
  isCurrentWeek: boolean;
  spent: string;
  earned: string;
  isFinalized: boolean;
  isClaimed: boolean;
  claimedAmount: string | null;
  claimedAt: string | null;
  deadline: string;
  isWithinDeadline: boolean;
  daysUntilDeadline: number | null;
}

interface UserVotesResponse {
  fid: number;
  currentWeekIndex: string;
  weeks: WeekStat[];
}

export function useUserVotes(fid?: number) {
  const { get } = useApi();
  const [stats, setStats] = useState<WeekStat[]>([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUserVotes = useCallback(async (cacheBust?: boolean) => {
    if (!fid) {
      setStats([]);
      return;
    }

    try {
      setIsLoading(true);
      const url = cacheBust 
        ? `/api/miniapps/fid-stats?fid=${fid}&_t=${Date.now()}`
        : `/api/miniapps/fid-stats?fid=${fid}`;
      const data = (await get(url)) as UserVotesResponse;
      setStats(data.weeks);
      setCurrentWeekIndex(data.currentWeekIndex);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch user votes")
      );
    } finally {
      setIsLoading(false);
    }
  }, [get, fid]);

  useEffect(() => {
    fetchUserVotes();
  }, [fetchUserVotes]);

  return {
    stats,
    currentWeekIndex,
    isLoading,
    error,
    refetch: fetchUserVotes,
  };
}
