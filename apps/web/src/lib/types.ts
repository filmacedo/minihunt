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

export interface WeekStat {
  weekId: string;
  startTime: string;
  endTime: string;
  isCurrentWeek: boolean;
  spent: string;
  earned: string;
}

