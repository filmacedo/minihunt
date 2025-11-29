import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import type { Abi } from "viem";

import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { getContractWeekMetadata } from "@/lib/repositories/weeks";
import type { Database } from "@/lib/database.types";

type WeekRecord = Database["public"]["Tables"]["weeks"]["Row"];

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
 * Calculate week index from a timestamp
 */
function calculateWeekIndex(timestamp: Date, startTime: bigint, weekSeconds: bigint): bigint {
  const timestampSeconds = BigInt(Math.floor(timestamp.getTime() / 1000));
  if (timestampSeconds < startTime) return 0n;
  const offset = timestampSeconds - startTime;
  return offset / weekSeconds;
}

/**
 * GET /api/miniapps/weeks?fid=<number>
 * 
 * Returns all weeks with their week indices and whether the user has rewards.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fidParam = searchParams.get("fid");

    // Get contract metadata
    const { startTime, weekSeconds } = await getContractWeekMetadata();

    // Get current week index
    const currentWeekIndex = (await publicClient.readContract({
      abi: WEEKLY_BETS_ABI,
      address: contractAddress,
      functionName: "getCurrentWeek",
    })) as bigint;

    // Get all weeks from database
    const { data: allWeeks, error: weeksError } = await client
      .from("weeks")
      .select("*")
      .order("start_time", { ascending: false });

    if (weeksError) {
      throw new Error(`Failed to fetch weeks: ${weeksError.message}`);
    }

    // Use contract's getWeekIndex function to ensure consistency
    const weeksWithIndices = await Promise.all(
      ((allWeeks || []) as WeekRecord[]).map(async (week) => {
        const timestampSeconds = BigInt(Math.floor(new Date(week.start_time).getTime() / 1000));
        let weekIndex: bigint;
        try {
          weekIndex = await publicClient.readContract({
            abi: WEEKLY_BETS_ABI,
            address: contractAddress,
            functionName: "getWeekIndex",
            args: [timestampSeconds],
          }) as bigint;
        } catch (error) {
          console.warn(`Failed to get week index for ${week.start_time}:`, error);
          // Fallback to manual calculation if contract call fails
          weekIndex = calculateWeekIndex(new Date(week.start_time), startTime, weekSeconds);
        }

        const isCurrentWeek = weekIndex === currentWeekIndex;
        
        // Debug logging
        if (process.env.NODE_ENV === 'development' && isCurrentWeek) {
          console.log(`[weeks API] Found current week: weekIndex=${weekIndex}, currentWeekIndex=${currentWeekIndex}, startTime=${week.start_time}`);
        }

        return {
          id: week.id,
          startTime: week.start_time,
          endTime: week.end_time,
          totalVoters: week.total_voters || "0",
          totalUniqueVoters: week.total_unique_voters || "0",
          prizePool: week.prize_pool || "0",
          weekIndex: weekIndex.toString(),
          isCurrentWeek,
        };
      })
    );
    
    const weeks = weeksWithIndices;

    // If user provided FID, check which weeks have rewards
    const weeksWithRewards: Set<string> = new Set();
    if (fidParam) {
      const fid = parseInt(fidParam, 10);
      if (!isNaN(fid) && fid > 0) {
        const fidString = fid.toString();
        const weekIds = weeks.map((w) => w.id);

        // Get earnings for this fid
        const { data: earnings, error: earningsError } = await client
          .from("fid_week_earnings")
          .select("week_id, earning_amount")
          .eq("fid", fidString)
          .in("week_id", weekIds);

        if (!earningsError && earnings) {
          earnings.forEach((earning) => {
            if (earning.earning_amount && earning.week_id && BigInt(earning.earning_amount) > 0n) {
              weeksWithRewards.add(earning.week_id.toString());
            }
          });
        }
      }
    }

    return NextResponse.json({
      weeks: weeks.map((week) => ({
        ...week,
        hasRewards: weeksWithRewards.has(week.id),
      })),
      currentWeekIndex: currentWeekIndex.toString(),
    });
  } catch (error) {
    console.error("Failed to fetch weeks:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch weeks",
      },
      { status: 500 }
    );
  }
}

