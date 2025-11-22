import { NextResponse } from "next/server";
import { keccak256, stringToHex } from "viem";

import { normalizeUrl, validateMiniApp } from "@/lib/miniapp-utils";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const supabaseClient = getSupabaseServerClient();

async function hasParticipatedInPastVoting(normalizedUrl: string): Promise<boolean> {
  const frameSignature = keccak256(stringToHex(normalizedUrl));

  // Try by frame_signature first (preferred for normalized URLs)
  const {
    data: miniAppBySignature,
    error: miniAppSignatureError,
  } = await supabaseClient
    .from("mini_apps")
    .select("id")
    .eq("frame_signature", frameSignature)
    .maybeSingle();

  if (miniAppSignatureError) {
    throw new Error(`Failed to load mini app by signature: ${miniAppSignatureError.message}`);
  }

  let miniAppId = miniAppBySignature?.id ?? null;

  // Fallback: match by stored frame_url (some legacy rows may only match by URL)
  if (!miniAppId) {
    const {
      data: miniAppByUrl,
      error: miniAppUrlError,
    } = await supabaseClient
      .from("mini_apps")
      .select("id")
      .eq("frame_url", normalizedUrl)
      .maybeSingle();

    if (miniAppUrlError) {
      throw new Error(`Failed to load mini app by URL: ${miniAppUrlError.message}`);
    }

    miniAppId = miniAppByUrl?.id ?? null;
  }

  // Additional fallback: handle stored URLs that might include a trailing slash
  if (!miniAppId && !normalizedUrl.endsWith("/")) {
    const {
      data: miniAppWithTrailingSlash,
      error: miniAppTrailingSlashError,
    } = await supabaseClient
      .from("mini_apps")
      .select("id")
      .eq("frame_url", `${normalizedUrl}/`)
      .maybeSingle();

    if (miniAppTrailingSlashError) {
      throw new Error(`Failed to load mini app by trailing slash: ${miniAppTrailingSlashError.message}`);
    }

    miniAppId = miniAppWithTrailingSlash?.id ?? null;
  }

  if (!miniAppId) {
    return false;
  }

  const {
    data: existingVote,
    error: voteLookupError,
  } = await supabaseClient
    .from("week_votes")
    .select("id")
    .eq("mini_app_id", miniAppId)
    .limit(1)
    .maybeSingle();

  if (voteLookupError) {
    throw new Error(`Failed to check mini app votes: ${voteLookupError.message}`);
  }

  return Boolean(existingVote);
}

/**
 * Validate if a URL is a valid mini app by checking for farcaster.json
 * 
 * POST /api/miniapps/validate
 * Body: { url: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL parameter is required and must be a string" },
        { status: 400 }
      );
    }

    let normalizedUrl: string | null = null;
    try {
      normalizedUrl = normalizeUrl(url);
    } catch {
      // Ignore normalization failures here; validateMiniApp will return the detailed error
    }

    // Validate the URL and fetch manifest
    const result = await validateMiniApp(url);

    const hasParticipatedBefore =
      normalizedUrl !== null ? await hasParticipatedInPastVoting(normalizedUrl) : false;

    if (!result.isValid) {
      return NextResponse.json(
        {
          isValid: false,
          error: result.error,
          manifest: result.manifest,
          hasParticipatedBefore,
        },
        { status: 200 } // Still return 200 with isValid: false for easier client handling
      );
    }

    return NextResponse.json({
      isValid: true,
      manifest: result.manifest,
      url: url,
      hasParticipatedBefore,
    });
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json(
      {
        isValid: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint with query parameter (alternative to POST)
 * GET /api/miniapps/validate?url=https://example.com
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Reuse POST logic by creating a mock request body
    const mockRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ url }),
    });

    return POST(mockRequest);
  } catch (error) {
    console.error("Validation GET error:", error);
    return NextResponse.json(
      {
        isValid: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

