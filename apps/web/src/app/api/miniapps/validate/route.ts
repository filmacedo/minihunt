import { NextResponse } from "next/server";
import { validateMiniApp } from "@/lib/miniapp-utils";

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

    // Validate the URL and fetch manifest
    const result = await validateMiniApp(url);

    if (!result.isValid) {
      return NextResponse.json(
        {
          isValid: false,
          error: result.error,
          manifest: result.manifest,
        },
        { status: 200 } // Still return 200 with isValid: false for easier client handling
      );
    }

    return NextResponse.json({
      isValid: true,
      manifest: result.manifest,
      url: url,
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

