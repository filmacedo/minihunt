import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import type { Abi } from "viem";

import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { type WeekRecord, getContractWeekMetadata } from "@/lib/repositories/weeks";

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

    // Get all weeks from database
    const { data: allWeeks, error: weeksError } = await client
      .from("weeks")
      .select("*")
      .order("start_time", { ascending: false });

    if (weeksError) {
      throw new Error(`Failed to fetch weeks: ${weeksError.message}`);
    }

    const weeks: WeekRecord[] = (allWeeks as WeekRecord[] | null) ?? ([] as WeekRecord[]);

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

    // Use contract's getWeekIndex function to ensure consistency
    // This guarantees we use the exact same calculation as the contract
    const weekIndices = await Promise.all(
      weeks.map(async (week) => {
        const timestampSeconds = BigInt(Math.floor(new Date(week.start_time).getTime() / 1000));
        try {
          return await publicClient.readContract({
            abi: WEEKLY_BETS_ABI,
            address: contractAddress,
            functionName: "getWeekIndex",
            args: [timestampSeconds],
          }) as bigint;
        } catch (error) {
          console.warn(`Failed to get week index for ${week.start_time}:`, error);
          // Fallback to manual calculation if contract call fails
          const { startTime, weekSeconds } = await getContractWeekMetadata();
          if (timestampSeconds < startTime) return 0n;
          const offset = timestampSeconds - startTime;
          return offset / weekSeconds;
        }
      })
    );

    // Get finalized status for all weeks in parallel
    // Note: Finalization is not required for claiming - the first claim can finalize the week
    // We still check finalization status for informational purposes only
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

    // Check for claims in database - fetch ALL claims for this fid first, then filter
    // This ensures we don't miss any claims due to week_id type mismatches
    const { data: allClaimsForFid, error: allClaimsError } = await client
      .from("week_claims")
      .select("week_id, claimed_amount, created_at")
      .eq("fid", fidString);

    if (allClaimsError) {
      console.error("Failed to fetch all claims:", allClaimsError);
      // Continue without claims data rather than failing
    }

    // Filter claims to only those matching our weeks
    // Convert both to strings for comparison to avoid type mismatches
    const weekIdSet = new Set(weekIds.map(id => id.toString()));
    const claims = allClaimsForFid?.filter(claim => 
      claim.week_id && weekIdSet.has(claim.week_id.toString())
    ) || [];

    // Debug logging for claims
    if (process.env.NODE_ENV === 'development') {
      console.log(`[fid-stats API] FID: ${fidString}, weekIds: ${JSON.stringify(weekIds.map(id => id.toString()))}, allClaimsForFid: ${allClaimsForFid?.length || 0}, filtered claims: ${claims.length}`);
      if (allClaimsForFid && allClaimsForFid.length > 0) {
        console.log(`[fid-stats API] All claims for FID:`, allClaimsForFid.map(c => ({ week_id: c.week_id?.toString(), amount: c.claimed_amount })));
      }
      if (claims.length > 0) {
        console.log(`[fid-stats API] Filtered claims:`, claims.map(c => ({ week_id: c.week_id?.toString(), amount: c.claimed_amount })));
      }
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

    // Debug logging for claims mapping
    if (process.env.NODE_ENV === 'development' && claimsByWeekId.size > 0) {
      console.log(`[fid-stats API] Claims mapped by weekId:`, Array.from(claimsByWeekId.entries()));
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

      // Debug logging for claim status
      if (process.env.NODE_ENV === 'development') {
        if (totalEarned > 0n) {
          console.log(`[fid-stats API] Week ${weekId} (index ${weekIndex}): earned=${totalEarned}, isClaimed=${isClaimed}, claimInfo=${claimInfo ? JSON.stringify(claimInfo) : 'null'}`);
        }
      }

      // Calculate 90-day deadline: week.endTime + 90 days
      const endTime = new Date(week.end_time);
      const deadline = new Date(endTime.getTime() + 90 * 24 * 60 * 60 * 1000);
      const now = new Date();
      const isWithinDeadline = now < deadline;
      const daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Determine if this is the current week using database startTime and endTime
      const weekStart = new Date(week.start_time);
      const weekEnd = new Date(week.end_time);
      const isCurrentWeek = now >= weekStart && now < weekEnd;
      
      // Debug logging
      if (process.env.NODE_ENV === 'development' && isCurrentWeek) {
        console.log(`[fid-stats API] Found current week: weekId=${weekId}, weekIndex=${weekIndex}, startTime=${week.start_time}, endTime=${week.end_time}, now=${now.toISOString()}`);
      }

      return {
        weekId: weekId,
        weekIndex: weekIndex.toString(),
        startTime: week.start_time,
        endTime: week.end_time,
        isCurrentWeek,
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

    // Find the current week index for the response
    const currentWeek = weekStats.find((w) => w.isCurrentWeek);
    const currentWeekIndex = currentWeek ? currentWeek.weekIndex : "0";

    return NextResponse.json({
      fid,
      currentWeekIndex,
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

