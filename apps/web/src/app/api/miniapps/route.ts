import { NextResponse } from "next/server";
import { z } from "zod";

import { createMiniApp, type MiniAppRecord } from "@/lib/repositories/miniapps";
import { getWeekLeaderboard } from "@/lib/repositories/leaderboard";
import { findOrCreateWeekByTimestamp } from "@/lib/repositories/weeks";

const createMiniAppSchema = z.object({
  frameUrl: z.string().url("frameUrl must be a valid URL"),
  frameSignature: z.string().min(1, "frameSignature is required"),
  name: z.string().min(1).max(280).optional(),
  description: z.string().max(2000).optional(),
  iconUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
});

function mapMiniApp(record: MiniAppRecord) {
  return {
    id: record.id,
    createdAt: record.created_at,
    frameUrl: record.frame_url,
    frameSignature: record.frame_signature,
    name: record.name,
    description: record.description,
    iconUrl: record.icon_url,
    imageUrl: record.image_url,
  };
}

function resolveTimestamp(value: string | null): Date | null {
  if (value === null) {
    return new Date();
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const milliseconds = trimmed.length === 10 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timestamp = resolveTimestamp(searchParams.get("timestamp"));

    if (!timestamp) {
      return NextResponse.json(
        { error: "timestamp must be a valid ISO string or unix epoch value" },
        { status: 400 }
      );
    }

    const week = await findOrCreateWeekByTimestamp(timestamp.toISOString());

    const leaderboard = await getWeekLeaderboard(week.id);

    return NextResponse.json({
      timestamp: timestamp.toISOString(),
      week: {
        id: week.id,
        startTime: week.start_time,
        endTime: week.end_time,
        totalVoters: week.total_voters,
        totalUniqueVoters: week.total_unique_voters,
        prizePool: week.prize_pool,
      },
      leaderboard: leaderboard.map((entry, index) => ({
        rank: index + 1,
        totalVotes: entry.totalVotes,
        totalSpentWei: entry.totalSpentWei.toString(),
        miniApp: mapMiniApp(entry.miniApp),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch weekly leaderboard:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load weekly leaderboard",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const validation = createMiniAppSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Invalid body",
        details: validation.error.flatten(),
      },
      { status: 400 }
    );
  }

  const payload = validation.data;

  try {
    const miniApp = await createMiniApp({
      frame_url: payload.frameUrl,
      frame_signature: payload.frameSignature,
      name: payload.name ?? null,
      description: payload.description ?? null,
      icon_url: payload.iconUrl ?? null,
      image_url: payload.imageUrl ?? null,
    });

    return NextResponse.json(
      {
        miniApp: mapMiniApp(miniApp),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create mini app:", error);
    const message = error instanceof Error ? error.message : "Failed to create mini app";
    const isConflict = message.toLowerCase().includes("duplicate key value");

    return NextResponse.json(
      {
        error: message,
      },
      { status: isConflict ? 409 : 500 }
    );
  }
}

