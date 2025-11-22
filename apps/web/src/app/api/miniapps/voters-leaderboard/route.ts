import { NextResponse } from "next/server";
import { findOrCreateWeekByTimestamp } from "@/lib/repositories/weeks";
import { getVoterEarningsLeaderboard } from "@/lib/repositories/leaderboard";

/**
 * GET /api/miniapps/voters-leaderboard?timestamp=<ISO string>
 * 
 * Returns a leaderboard of voters sorted by earnings for a given week.
 * If timestamp is not provided, uses the current timestamp.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestampParam = searchParams.get("timestamp");

    // Use current timestamp if not provided
    const timestampISO = timestampParam || new Date().toISOString();

    // Validate timestamp format
    const timestampMs = Date.parse(timestampISO);
    if (Number.isNaN(timestampMs)) {
      return NextResponse.json(
        { error: "Invalid timestamp format. Expected ISO 8601 format." },
        { status: 400 }
      );
    }

    // Find or create the week for this timestamp
    const weekRecord = await findOrCreateWeekByTimestamp(timestampISO);

    // Get the voter earnings leaderboard for this week
    const leaderboard = await getVoterEarningsLeaderboard(weekRecord.id.toString());

    return NextResponse.json({
      week: {
        id: weekRecord.id,
        startTime: weekRecord.start_time,
        endTime: weekRecord.end_time,
      },
      leaderboard: leaderboard.map((entry) => ({
        fid: entry.fid,
        paidAmount: entry.paidAmount.toString(),
        earningAmount: entry.earningAmount.toString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch voters leaderboard:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch voters leaderboard",
      },
      { status: 500 }
    );
  }
}

