import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http, decodeEventLog, type Address, type Hash } from "viem";
import type { Abi } from "viem";

import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { findOrCreateWeekByTimestamp, getContractWeekMetadata } from "@/lib/repositories/weeks";
import { ensureUserExists } from "@/lib/repositories/users";

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

const claimRequestSchema = z.object({
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "tx_hash must be a valid transaction hash"),
  fid: z.number().int().positive(),
});

/**
 * POST /api/miniapps/claim
 * Body: { tx_hash: string, fid: number }
 * 
 * Decodes transaction events, creates week_claims entry.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = claimRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { tx_hash, fid } = validation.data;
    const txHash = tx_hash as Hash;

    // Get transaction receipt
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Verify transaction is to the correct contract
    if (receipt.to?.toLowerCase() !== contractAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Transaction is not to the MiniAppWeeklyBets contract" },
        { status: 400 }
      );
    }

    // Find the Claimed event
    const claimedEvent = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({
            abi: WEEKLY_BETS_ABI,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          return null;
        }
      })
      .find((decoded) => decoded && decoded.eventName === "Claimed");

    if (!claimedEvent || claimedEvent.eventName !== "Claimed") {
      return NextResponse.json(
        { error: "Claimed event not found in transaction" },
        { status: 400 }
      );
    }

    const { week: weekIndex, claimer, amount } = claimedEvent.args as {
      week: bigint;
      claimer: Address;
      amount: bigint;
    };

    // Ensure user exists
    await ensureUserExists(fid);

    // Get contract metadata to calculate week start time
    const { startTime, weekSeconds } = await getContractWeekMetadata();
    const weekStartSeconds = startTime + weekIndex * weekSeconds;
    const weekStartISO = new Date(Number(weekStartSeconds) * 1000).toISOString();

    // Find or create the week
    const week = await findOrCreateWeekByTimestamp(weekStartISO);

    // Check if claim already exists
    const { data: existingClaim } = await client
      .from("week_claims")
      .select("*")
      .eq("fid", fid.toString())
      .eq("week_id", week.id)
      .maybeSingle();

    if (existingClaim) {
      return NextResponse.json(
        {
          success: true,
          message: "Claim already recorded",
          claim: existingClaim,
        },
        { status: 200 }
      );
    }

    // Insert claim record
    const { data: claim, error: claimError } = await client
      .from("week_claims")
      .insert({
        fid: fid.toString(),
        week_id: week.id,
        week_index: weekIndex.toString(),
        transaction_hash: txHash,
        claimed_amount: amount.toString(),
      })
      .select()
      .single();

    if (claimError) {
      console.error("Failed to insert claim:", claimError);
      return NextResponse.json(
        {
          error: "Failed to record claim",
          details: claimError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      claim,
    });
  } catch (error) {
    console.error("Failed to process claim:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process claim",
      },
      { status: 500 }
    );
  }
}

