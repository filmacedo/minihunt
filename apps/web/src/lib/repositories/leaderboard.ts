import "server-only";

import type { Database } from "@/lib/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MiniAppRecord } from "@/lib/repositories/miniapps";

type WeekVotesTable = Database["public"]["Tables"]["week_votes"];

type WeekVoteWithMiniApp = Pick<WeekVotesTable["Row"], "mini_app_id" | "paid_amount"> & {
  mini_apps: MiniAppRecord | null;
};

export interface WeekLeaderboardEntry {
  miniApp: MiniAppRecord;
  totalVotes: number;
  totalSpentWei: bigint;
}

function toWeiBigInt(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return 0n;
  }

  try {
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
}

const client = getSupabaseServerClient();

export async function getWeekLeaderboard(weekId: string): Promise<WeekLeaderboardEntry[]> {
  const { data, error } = await client
    .from("week_votes")
    .select(
      `
        mini_app_id,
        paid_amount,
        mini_apps (
          id,
          created_at,
          frame_url,
          frame_signature,
          name,
          description,
          icon_url,
          image_url
        )
      `
    )
    .eq("week_id", weekId);

  if (error) {
    throw new Error(`Failed to load leaderboard for week ${weekId}: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  const leaderboardMap = new Map<string, WeekLeaderboardEntry>();

  for (const row of data as WeekVoteWithMiniApp[]) {
    const miniApp = row.mini_apps;
    if (!miniApp) {
      continue;
    }
    const amount = toWeiBigInt(row.paid_amount);

    const existing = leaderboardMap.get(miniApp.id);
    if (existing) {
      existing.totalVotes += 1;
      existing.totalSpentWei += amount;
    } else {
      leaderboardMap.set(miniApp.id, {
        miniApp,
        totalVotes: 1,
        totalSpentWei: amount,
      });
    }
  }

  return Array.from(leaderboardMap.values()).sort((a, b) => {
    if (b.totalVotes === a.totalVotes) {
      return new Date(a.miniApp.created_at).getTime() - new Date(b.miniApp.created_at).getTime();
    }
    return b.totalVotes - a.totalVotes;
  });
}

export interface VoterEarningsEntry {
  fid: string;
  paidAmount: bigint;
  earningAmount: bigint;
  user: {
    id: string;
    name: string | null;
    bio: string | null;
    profile_image_url: string | null;
  } | null;
}

export async function getVoterEarningsLeaderboard(weekId: string): Promise<VoterEarningsEntry[]> {
  const { data, error } = await client
    .from("fid_week_earnings")
    .select(
      `
        fid,
        paid_amount,
        earning_amount,
        users (
          id,
          name,
          bio,
          profile_image_url
        )
      `
    )
    .eq("week_id", weekId)
    .order("earning_amount", { ascending: false });

  if (error) {
    throw new Error(`Failed to load voter earnings leaderboard for week ${weekId}: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((row: any) => ({
    fid: row.fid.toString(),
    paidAmount: toWeiBigInt(row.paid_amount),
    earningAmount: toWeiBigInt(row.earning_amount),
    user: row.users ? {
      id: row.users.id,
      name: row.users.name,
      bio: row.users.bio,
      profile_image_url: row.users.profile_image_url,
    } : null,
  }));
}

