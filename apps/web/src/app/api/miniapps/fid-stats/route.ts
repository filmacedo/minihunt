import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import type { Abi } from "viem";

import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { findOrCreateWeekByTimestamp, type WeekRecord, getContractWeekMetadata } from "@/lib/repositories/weeks";

const WEEKLY_BETS_ABI = MINI_APP_WEEKLY_BETS_ABI as Abi;

// Celo Mainnet chain configuration
const celoMainnet = {
  id: 42220,
  name: "Celo",
  network: "celo",
  nativeCurrency: {
    decimals: 18,
    name: "CELO",
    symbol: "CELO",
  },
  rpcUrls: {
    default: {
      http: [env.CELO_RPC_URL],
    },
    public: {
      http: [env.CELO_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Celoscan",
      url: "https://celoscan.io",
    },
  },
} as const;

const contractAddress = env.MINI_APP_WEEKLY_BETS_ADDRESS as Address;

const publicClient = createPublicClient({
  transport: http(env.CELO_RPC_URL),
  chain: celoMainnet,
});

const client = getSupabaseServerClient();

/**
 * GET /api/miniapps/fid-stats?fid=<number>
 * 
 * Returns spending and earnings for each week (including current week) for a given fid.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fidParam = searchParams.get("fid");

    if (!fidParam) {
      return NextResponse.json(
        { error: "fid query parameter is required" },
        { status: 400 }
      );
    }

    const fid = parseInt(fidParam, 10);
    if (isNaN(fid) || fid <= 0) {
      return NextResponse.json(
        { error: "fid must be a positive integer" },
        { status: 400 }
      );
    }

    const fidString = fid.toString();

    // Get current week from contract
    let currentWeekIndex: bigint;
    let currentWeekStartTime: Date;
    try {
      currentWeekIndex = (await publicClient.readContract({
        abi: WEEKLY_BETS_ABI,
        address: contractAddress,
        functionName: "getCurrentWeek",
      })) as bigint;

      // Get startTime from contract to calculate current week's start time
      const startTime = (await publicClient.readContract({
        abi: WEEKLY_BETS_ABI,
        address: contractAddress,
        functionName: "startTime",
      })) as bigint;

      const weekSeconds = (await publicClient.readContract({
        abi: WEEKLY_BETS_ABI,
        address: contractAddress,
        functionName: "WEEK_SECONDS",
      })) as bigint;

      const currentWeekStartSeconds = startTime + currentWeekIndex * weekSeconds;
      currentWeekStartTime = new Date(Number(currentWeekStartSeconds) * 1000);
    } catch (error) {
      console.error("Failed to get current week from contract:", error);
      return NextResponse.json(
        {
          error: "Failed to get current week from contract",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Ensure current week exists in database
    const currentWeek = await findOrCreateWeekByTimestamp(currentWeekStartTime.toISOString());

    // Get all weeks from database
    const { data: allWeeks, error: weeksError } = await client
      .from("weeks")
      .select("*")
      .order("start_time", { ascending: false });

    if (weeksError) {
      throw new Error(`Failed to fetch weeks: ${weeksError.message}`);
    }

    // Ensure we have at least the current week
    const weeks: WeekRecord[] = (allWeeks as WeekRecord[] | null) ?? ([] as WeekRecord[]);
    const hasCurrentWeek = weeks.some((w) => w.id === currentWeek.id);
    if (!hasCurrentWeek) {
      weeks.push(currentWeek);
      // Re-sort by start_time descending
      weeks.sort((a, b) => 
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );
    }

    // Get all week IDs
    const weekIds = weeks.map((w) => w.id);

    // Get all votes for this fid across all weeks
    const { data: allVotes, error: votesError } = await client
      .from("week_votes")
      .select("week_id, paid_amount")
      .eq("fid", fidString)
      .in("week_id", weekIds);

    if (votesError) {
      throw new Error(`Failed to fetch votes: ${votesError.message}`);
    }

    // Get all earnings for this fid across all weeks
    const { data: allEarnings, error: earningsError } = await client
      .from("fid_week_earnings")
      .select("week_id, paid_amount, earning_amount")
      .eq("fid", fidString)
      .in("week_id", weekIds);

    if (earningsError) {
      throw new Error(`Failed to fetch earnings: ${earningsError.message}`);
    }

    // Create maps for quick lookup
    const votesByWeekId = new Map<string, bigint>();
    if (allVotes) {
      for (const vote of allVotes) {
        const weekId = vote.week_id.toString();
        const paidAmount = vote.paid_amount ? BigInt(vote.paid_amount) : 0n;
        votesByWeekId.set(weekId, (votesByWeekId.get(weekId) || 0n) + paidAmount);
      }
    }

    const earningsByWeekId = new Map<
      string,
      { paidAmount: bigint; earningAmount: bigint }
    >();
    if (allEarnings) {
      for (const earning of allEarnings) {
        if (!earning.week_id) continue;
        const weekId = earning.week_id.toString();
        earningsByWeekId.set(weekId, {
          paidAmount: earning.paid_amount ? BigInt(earning.paid_amount) : 0n,
          earningAmount: earning.earning_amount ? BigInt(earning.earning_amount) : 0n,
        });
      }
    }

    // Get contract metadata for week index calculation
    const { startTime, weekSeconds } = await getContractWeekMetadata();

    // Helper function to calculate week index
    const calculateWeekIndex = (startTimeISO: string): bigint => {
      const timestampSeconds = BigInt(Math.floor(new Date(startTimeISO).getTime() / 1000));
      if (timestampSeconds < startTime) return 0n;
      const offset = timestampSeconds - startTime;
      return offset / weekSeconds;
    };

    // Get finalized status for all weeks in parallel
    // Note: Finalization is not required for claiming - the first claim can finalize the week
    // We still check finalization status for informational purposes only
    const weekIndices = weeks.map((week) => calculateWeekIndex(week.start_time));
    const finalizedStatuses = await Promise.all(
      weekIndices.map(async (weekIndex) => {
        try {
          return await publicClient.readContract({
            abi: WEEKLY_BETS_ABI,
            address: contractAddress,
            functionName: "isWeekFinalized",
            args: [weekIndex],
          }) as boolean;
        } catch (error) {
          // If contract call fails, assume not finalized
          // This is informational only - claiming doesn't require finalization
          console.warn(`Failed to check finalization for week ${weekIndex}:`, error);
          return false;
        }
      })
    );

    // Check for claims in database
    const { data: claims, error: claimsError } = await client
      .from("week_claims")
      .select("week_id, claimed_amount, created_at")
      .eq("fid", fidString)
      .in("week_id", weekIds);

    if (claimsError) {
      console.error("Failed to fetch claims:", claimsError);
      // Continue without claims data rather than failing
    }

    // Create map of claims by week ID
    const claimsByWeekId = new Map<
      string,
      { amount: string; claimedAt: string }
    >();
    if (claims) {
      for (const claim of claims) {
        if (!claim.week_id) continue;
        const weekId = claim.week_id.toString();
        claimsByWeekId.set(weekId, {
          amount: claim.claimed_amount || "0",
          claimedAt: claim.created_at,
        });
      }
    }

    // Build response with week stats
    const weekStats = weeks.map((week, index) => {
      const weekId = week.id.toString();
      const spentFromVotes = votesByWeekId.get(weekId) || 0n;
      const earnings = earningsByWeekId.get(weekId);
      
      // Use earnings table if available, otherwise use votes sum
      const totalSpent = earnings?.paidAmount || spentFromVotes;
      const totalEarned = earnings?.earningAmount || 0n;

      const weekIndex = weekIndices[index];
      const isFinalized = finalizedStatuses[index];
      const claimInfo = claimsByWeekId.get(weekId);
      const isClaimed = !!claimInfo;

      // Calculate 90-day deadline: week.endTime + 90 days
      const endTime = new Date(week.end_time);
      const deadline = new Date(endTime.getTime() + 90 * 24 * 60 * 60 * 1000);
      const now = new Date();
      const isWithinDeadline = now < deadline;
      const daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        weekId: week.id.toString(),
        weekIndex: weekIndex.toString(),
        startTime: week.start_time,
        endTime: week.end_time,
        isCurrentWeek: week.id === currentWeek.id,
        spent: totalSpent.toString(),
        earned: totalEarned.toString(),
        isFinalized,
        isClaimed,
        claimedAmount: claimInfo?.amount || null,
        claimedAt: claimInfo?.claimedAt || null,
        deadline: deadline.toISOString(),
        isWithinDeadline,
        daysUntilDeadline: isWithinDeadline ? daysUntilDeadline : null,
      };
    });

    return NextResponse.json({
      fid,
      currentWeekIndex: currentWeekIndex.toString(),
      weeks: weekStats,
    });
  } catch (error) {
    console.error("Failed to fetch fid stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch fid stats",
      },
      { status: 500 }
    );
  }
}

