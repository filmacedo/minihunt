import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http, decodeEventLog, decodeFunctionData, type Address, type Hash } from "viem";
import type { Abi } from "viem";

import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import MINI_APP_WEEKLY_BETS_ABI from "@/lib/abis/mini-app-weekly-bets.json";
import { createMiniApp } from "@/lib/repositories/miniapps";
import { findOrCreateWeekByTimestamp } from "@/lib/repositories/weeks";
import { ensureUserExists } from "@/lib/repositories/users";
import { fetchFarcasterManifest } from "@/lib/miniapp-utils";

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

const voteRequestSchema = z.object({
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "tx_hash must be a valid transaction hash"),
  fid: z.number().int().positive(),
});

/**
 * POST /api/miniapps/vote
 * Body: { tx_hash: string, fid: number }
 * 
 * Decodes transaction events, creates week_votes entry, ensures mini_app exists,
 * and refreshes fid_week_earnings and weeks tables.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = voteRequestSchema.safeParse(body);

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

    // Find the Voted event
    const votedEvent = receipt.logs
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
      .find((decoded) => decoded && decoded.eventName === "Voted");

    if (!votedEvent || votedEvent.eventName !== "Voted") {
      return NextResponse.json(
        { error: "Voted event not found in transaction" },
        { status: 400 }
      );
    }

    // Type assertion through unknown to handle viem's event args typing
    const eventArgs = votedEvent.args as unknown as {
      appHash: Hash;
      voter: Address;
      pricePaid: bigint;
      week: bigint;
    };

    const { appHash, voter, pricePaid, week } = eventArgs;

    // Ensure user exists in the database (fetch from Neynar if needed)
    await ensureUserExists(fid);

    // Get the transaction to decode the input and extract fullUrl
    const tx = await publicClient.getTransaction({ hash: txHash });
    
    let fullUrl: string;
    try {
      const decoded = decodeFunctionData({
        abi: WEEKLY_BETS_ABI,
        data: tx.input,
      });
      
      if (decoded.functionName !== "vote") {
        return NextResponse.json(
          { error: "Transaction is not a vote transaction" },
          { status: 400 }
        );
      }

      if (!decoded.args || decoded.args.length < 2) {
        return NextResponse.json(
          { error: "Invalid vote transaction arguments" },
          { status: 400 }
        );
      }

      fullUrl = decoded.args[1] as string; // fullUrl is the second parameter
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to decode transaction input: ${error instanceof Error ? error.message : "Unknown error"}` },
        { status: 400 }
      );
    }

    // Ensure mini_app exists
    const appHashHex = appHash as string;
    let miniApp: { id: string; frame_url: string; frame_signature: string };
    
    try {
      // Try to find existing mini_app by frame_signature (appHash)
      const { data: existingApp } = await client
        .from("mini_apps")
        .select("*")
        .eq("frame_signature", appHashHex)
        .maybeSingle();

      if (existingApp) {
        miniApp = existingApp as { id: string; frame_url: string; frame_signature: string };
      } else {
        // Fetch metadata from farcaster.json manifest
        let name: string | null = null;
        let description: string | null = null;
        let iconUrl: string | null = null;
        let imageUrl: string | null = null;

        try {
          const manifest = await fetchFarcasterManifest(fullUrl);
          if (manifest) {
            const frame = manifest.frame || manifest.miniapp;
            if (frame) {
              name = typeof frame.name === "string" ? frame.name : null;
              description = typeof frame.description === "string" ? frame.description : 
                           (typeof frame.tagline === "string" ? frame.tagline : null);
              iconUrl = typeof frame.iconUrl === "string" ? frame.iconUrl : null;
              // Try multiple image fields in order of preference
              imageUrl = (typeof frame.heroImageUrl === "string" ? frame.heroImageUrl : null) ||
                        (typeof frame.splashImageUrl === "string" ? frame.splashImageUrl : null) ||
                        (typeof frame.ogImageUrl === "string" ? frame.ogImageUrl : null) ||
                        (typeof frame.imageUrl === "string" ? frame.imageUrl : null) ||
                        null;
            }
          }
        } catch (error) {
          // Log but don't fail - we'll create the mini app with null metadata
          console.warn(`Failed to fetch metadata for ${fullUrl}:`, error instanceof Error ? error.message : "Unknown error");
        }

        // Create new mini_app with fetched metadata
        miniApp = await createMiniApp({
          frame_url: fullUrl,
          frame_signature: appHashHex,
          name,
          description,
          icon_url: iconUrl,
          image_url: imageUrl,
        });
      }
    } catch (error) {
      // If it's a duplicate key error on frame_url, try to find by frame_url
      if (error instanceof Error && error.message.toLowerCase().includes("duplicate")) {
        const { data: existingByUrl } = await client
          .from("mini_apps")
          .select("*")
          .eq("frame_url", fullUrl)
          .maybeSingle();
        
        if (existingByUrl) {
          miniApp = existingByUrl as { id: string; frame_url: string; frame_signature: string };
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Get the block to get the transaction timestamp
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    const blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
    
    // Get or create week using the block timestamp
    const weekRecord = await findOrCreateWeekByTimestamp(blockTimestamp);

    // Check if vote already exists (by transaction_hash)
    const { data: existingVote } = await client
      .from("week_votes")
      .select("*")
      .eq("transaction_hash", txHash)
      .maybeSingle();

    if (existingVote) {
      return NextResponse.json(
        { error: "Vote already processed", vote: existingVote },
        { status: 409 }
      );
    }

    // Create week_votes entry
    const { data: weekVote, error: voteError } = await client
      .from("week_votes")
      .insert({
        mini_app_id: miniApp.id,
        fid: fid.toString(),
        week_id: weekRecord.id,
        transaction_hash: txHash,
        paid_amount: pricePaid.toString(),
      })
      .select()
      .single();

    if (voteError) {
      throw new Error(`Failed to create week_vote: ${voteError.message}`);
    }

    // Refresh weeks table - aggregate all votes for this week
    const { data: weekVotes } = await client
      .from("week_votes")
      .select("paid_amount, fid")
      .eq("week_id", weekRecord.id);

    if (weekVotes) {
      const totalVoters = weekVotes.length;
      const uniqueVoters = new Set(weekVotes.map((v) => v.fid)).size;
      const prizePool = weekVotes.reduce((sum, v) => {
        const amount = v.paid_amount ? BigInt(v.paid_amount) : 0n;
        return sum + amount;
      }, 0n);

      await client
        .from("weeks")
        .update({
          total_voters: totalVoters.toString(),
          total_unique_voters: uniqueVoters.toString(),
          prize_pool: prizePool.toString(),
        })
        .eq("id", weekRecord.id);
    }

    // Refresh fid_week_earnings
    const { data: userVotes } = await client
      .from("week_votes")
      .select("paid_amount")
      .eq("week_id", weekRecord.id)
      .eq("fid", fid.toString());

    if (userVotes) {
      const paidAmount = userVotes.reduce((sum, v) => {
        const amount = v.paid_amount ? BigInt(v.paid_amount) : 0n;
        return sum + amount;
      }, 0n);

      // Get earning amount from contract
      let earningAmount = 0n;
      try {
        const earning = await publicClient.readContract({
          abi: WEEKLY_BETS_ABI,
          address: contractAddress,
          functionName: "getUserPayoutForWeek",
          args: [week, voter],
        });
        earningAmount = earning as bigint;
      } catch (error) {
        console.error("Failed to get user payout from contract:", error);
        // Continue with 0 earning amount if contract call fails
      }

      // Check if fid_week_earnings record exists
      const { data: existingEarnings } = await client
        .from("fid_week_earnings")
        .select("*")
        .eq("fid", fid.toString())
        .eq("week_id", weekRecord.id)
        .maybeSingle();

      if (existingEarnings) {
        // Update existing record
        const { error: updateError } = await client
          .from("fid_week_earnings")
          .update({
            paid_amount: paidAmount.toString(),
            earning_amount: earningAmount.toString(),
          })
          .eq("fid", fid.toString())
          .eq("week_id", weekRecord.id);

        if (updateError) {
          console.error("Failed to update fid_week_earnings:", updateError);
          // Don't fail the request if earnings update fails
        }
      } else {
        // Insert new record
        const { error: insertError } = await client
          .from("fid_week_earnings")
          .insert({
            fid: fid.toString(),
            week_id: weekRecord.id,
            paid_amount: paidAmount.toString(),
            earning_amount: earningAmount.toString(),
          });

        if (insertError) {
          console.error("Failed to insert fid_week_earnings:", insertError);
          // Don't fail the request if earnings insert fails
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        vote: weekVote,
        miniApp: {
          id: miniApp.id,
          frameUrl: miniApp.frame_url,
          frameSignature: miniApp.frame_signature,
        },
        week: {
          id: weekRecord.id,
          weekIndex: week.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Vote processing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process vote",
      },
      { status: 500 }
    );
  }
}

