import { useState, useEffect, useCallback } from "react";
import { useApi } from "./use-api";

export interface WeekWithIndex {
  id: string;
  startTime: string;
  endTime: string;
  totalVoters: string;
  totalUniqueVoters: string;
  prizePool: string;
  weekIndex: string;
  isCurrentWeek: boolean;
  hasRewards: boolean;
}

interface WeeksResponse {
  weeks: WeekWithIndex[];
  currentWeekIndex: string;
}

export function useWeeks(fid?: number) {
  const { get } = useApi();
  const [weeks, setWeeks] = useState<WeekWithIndex[]>([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWeeks = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = fid 
        ? `/api/miniapps/weeks?fid=${fid}`
        : `/api/miniapps/weeks`;
      const data = (await get(url)) as WeeksResponse;
      setWeeks(data.weeks);
      setCurrentWeekIndex(data.currentWeekIndex);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch weeks")
      );
    } finally {
      setIsLoading(false);
    }
  }, [get, fid]);

  useEffect(() => {
    fetchWeeks();
  }, [fetchWeeks]);

  return {
    weeks,
    currentWeekIndex,
    isLoading,
    error,
    refetch: fetchWeeks,
  };
}

