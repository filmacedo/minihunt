import "server-only";

import type { Abi, Address } from "viem";
import { createPublicClient, http } from "viem";

import type { Database } from "@/lib/database.types";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type WeekTable = Database["public"]["Tables"]["weeks"];

export type WeekRecord = WeekTable["Row"];

type ContractWeekMetadata = {
  startTime: bigint;
  weekSeconds: bigint;
};

const WEEKLY_BETS_ABI = MINI_APP_WEEKLY_BETS_ABI as Abi;

const WEEK_SECONDS_FALLBACK = 7n * 24n * 60n * 60n;

const contractAddress = env.MINI_APP_WEEKLY_BETS_ADDRESS as Address;

const publicClient = createPublicClient({
  transport: http(env.CELO_RPC_URL),
});

const client = getSupabaseServerClient();

let contractMetadataPromise: Promise<ContractWeekMetadata> | null = null;

export async function getContractWeekMetadata(): Promise<ContractWeekMetadata> {
  if (!contractMetadataPromise) {
    contractMetadataPromise = (async () => {
      const startTime = (await publicClient.readContract({
        abi: WEEKLY_BETS_ABI,
        address: contractAddress,
        functionName: "startTime",
      })) as bigint;

      const weekSeconds = (await publicClient
        .readContract({
          abi: WEEKLY_BETS_ABI,
          address: contractAddress,
          functionName: "WEEK_SECONDS",
        })
        .catch(() => WEEK_SECONDS_FALLBACK)) as bigint;

      return {
        startTime,
        weekSeconds: weekSeconds ?? WEEK_SECONDS_FALLBACK,
      };
    })();
  }

  return contractMetadataPromise;
}

function toIsoString(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

async function fetchWeekByStartTime(startTimeISO: string): Promise<WeekRecord | null> {
  const { data, error } = await client
    .from("weeks")
    .select("*")
    .eq("start_time", startTimeISO)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load week starting at ${startTimeISO}: ${error.message}`);
  }

  return (data ?? null) as WeekRecord | null;
}

export async function findOrCreateWeekByTimestamp(timestampISO: string): Promise<WeekRecord> {
  const timestampMs = Date.parse(timestampISO);

  if (Number.isNaN(timestampMs)) {
    throw new Error(`Invalid timestamp format: ${timestampISO}`);
  }

  const timestampSeconds = BigInt(Math.floor(timestampMs / 1000));
  const { startTime, weekSeconds } = await getContractWeekMetadata();

  const offset = timestampSeconds > startTime ? timestampSeconds - startTime : 0n;
  const weekIndex = offset / weekSeconds;
  const weekStartSeconds = startTime + weekIndex * weekSeconds;
  const weekEndSeconds = weekStartSeconds + weekSeconds;

  const weekStartISO = toIsoString(weekStartSeconds);

  const existingWeek = await fetchWeekByStartTime(weekStartISO);
  if (existingWeek) {
    return existingWeek;
  }

  const insertPayload: WeekTable["Insert"] = {
    start_time: weekStartISO,
    end_time: toIsoString(weekEndSeconds),
    prize_pool: "0",
    total_unique_voters: "0",
    total_voters: "0",
  };

  const { data: insertedWeek, error: insertError } = await client
    .from("weeks")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const retryWeek = await fetchWeekByStartTime(weekStartISO);
      if (retryWeek) {
        return retryWeek;
      }
    }
    throw new Error(`Failed to create week ${weekStartISO}: ${insertError.message}`);
  }

  return insertedWeek as WeekRecord;
}

