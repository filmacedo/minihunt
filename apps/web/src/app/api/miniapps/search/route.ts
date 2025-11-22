import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Search for mini apps using Neynar API
 * 
 * POST /api/miniapps/search
 * Body: { query: string, limit?: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, limit = 20 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query parameter is required and must be a string" },
        { status: 400 }
      );
    }

    if (!env.NEYNAR_API_KEY || env.NEYNAR_API_KEY === "") {
      return NextResponse.json(
        { error: "Neynar API key is not configured. Please set NEYNAR_API_KEY in your .env.local file in apps/web/ directory" },
        { status: 500 }
      );
    }

    // Call Neynar API to search for frames/mini apps
    const searchParams = new URLSearchParams({
      q: query,
      limit: limit.toString(),
    });
    
    const neynarUrl = `https://api.neynar.com/v2/farcaster/frame/search?${searchParams.toString()}`;
    
    const response = await fetch(neynarUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "x-api-key": env.NEYNAR_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Neynar API error:", response.status, errorText);
      
      return NextResponse.json(
        { 
          error: "Failed to search mini apps",
          details: response.status === 401 ? "Invalid API key" : response.status === 404 ? "Endpoint not found" : "Unknown error",
          status: response.status,
        },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    const data = await response.json();

    // Parse Neynar's response format
    // Response structure: { frames: [...], next: { cursor: ... } }
    let frames = data.frames || data.results || [];
    
    // Ensure frames is an array
    if (!Array.isArray(frames)) {
      frames = [];
    }

    // Map Neynar's frame data to our format
    const formattedResults = frames
      .slice(0, limit)
      .map((frame: any) => {
        // Extract data from frame object and nested manifest/metadata
        const manifest = frame.manifest || {};
        const metadata = frame.metadata || {};
        
        // Extract frame fields from the nested objects
        const frameData = manifest.frame || metadata.frame || {};
        
        return {
          name: frameData.name || manifest.name || metadata.name || frame.name || null,
          description: frameData.description || manifest.description || metadata.description || frame.description || null,
          iconUrl: frame.image || frameData.iconUrl || manifest.iconUrl || metadata.iconUrl || null,
          homeUrl: frame.frames_url || frame.url || frameData.homeUrl || manifest.homeUrl || metadata.homeUrl || null,
          tags: frameData.tags || manifest.tags || metadata.tags || frame.tags || [],
          version: frame.version || frameData.version || manifest.version || null,
          // Include additional fields if available
          ...(frame.author && { author: frame.author }),
        };
      })
      .filter((item: any) => item.homeUrl); // Filter out frames without a URL

    return NextResponse.json({
      results: formattedResults,
      query,
      count: formattedResults.length,
      // Include pagination cursor if available
      ...(data.next?.cursor && { nextCursor: data.next.cursor }),
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint with query parameter (alternative to POST)
 * GET /api/miniapps/search?q=query&limit=20
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    // Reuse POST logic by creating a mock request body
    const mockRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ query, limit }),
    });

    return POST(mockRequest);
  } catch (error) {
    console.error("Search GET error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

