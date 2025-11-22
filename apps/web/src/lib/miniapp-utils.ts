/**
 * Utility functions for mini app validation and fetching
 */

export interface FarcasterManifest {
  accountAssociation?: {
    header: string;
    payload: string;
    signature: string;
  };
  frame?: {
    version: string;
    name: string;
    subtitle?: string;
    description: string;
    iconUrl: string;
    splashImageUrl?: string;
    splashBackgroundColor?: string;
    homeUrl: string;
    webhookUrl?: string;
    primaryCategory?: string;
    tags?: string[];
    heroImageUrl?: string;
    tagline?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    [key: string]: unknown;
  };
  // Some manifests use "miniapp" instead of "frame"
  miniapp?: {
    version: string;
    name: string;
    subtitle?: string;
    description: string;
    iconUrl: string;
    splashImageUrl?: string;
    splashBackgroundColor?: string;
    homeUrl: string;
    webhookUrl?: string;
    primaryCategory?: string;
    tags?: string[];
    heroImageUrl?: string;
    tagline?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    imageUrl?: string;
    buttonTitle?: string;
    screenshotUrls?: string[];
    noindex?: boolean;
    [key: string]: unknown;
  };
  baseBuilder?: {
    allowedAddresses?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Normalize a URL to ensure it's properly formatted
 */
export function normalizeUrl(url: string): string {
  try {
    // Remove trailing slashes
    let normalized = url.trim().replace(/\/+$/, "");
    
    // If no protocol, add https://
    if (!normalized.match(/^https?:\/\//)) {
      normalized = `https://${normalized}`;
    }
    
    const urlObj = new URL(normalized);
    
    // Return the origin + pathname (removes query params and hash)
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
}

/**
 * Fetch and parse the farcaster.json manifest from a URL
 */
export async function fetchFarcasterManifest(url: string): Promise<FarcasterManifest | null> {
  try {
    const normalizedUrl = normalizeUrl(url);
    const manifestUrl = `${normalizedUrl}/.well-known/farcaster.json`;
    
    const response = await fetch(manifestUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      // Add a timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Manifest doesn't exist
      }
      throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
    }

    const manifest = await response.json();
    return manifest as FarcasterManifest;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timeout: The manifest URL took too long to respond");
    }
    if (err instanceof TypeError && err.message.includes("Invalid URL")) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    throw err;
  }
}

/**
 * Validate if a URL is a valid mini app by checking for farcaster.json
 */
export async function validateMiniApp(url: string): Promise<{
  isValid: boolean;
  manifest: FarcasterManifest | null;
  error?: string;
}> {
  try {
    const manifest = await fetchFarcasterManifest(url);
    
    if (!manifest) {
      return {
        isValid: false,
        manifest: null,
        error: "No farcaster.json manifest found at /.well-known/farcaster.json",
      };
    }

    // Basic validation: check if it has frame or miniapp information
    // Some manifests use "miniapp" instead of "frame"
    const frame = manifest.frame || manifest.miniapp;
    
    if (!frame) {
      return {
        isValid: false,
        manifest,
        error: "Manifest found but missing 'frame' or 'miniapp' object",
      };
    }

    // Validate required frame/miniapp fields
    if (!frame.name || !frame.iconUrl || !frame.homeUrl) {
      return {
        isValid: false,
        manifest,
        error: "Manifest frame/miniapp is missing required fields (name, iconUrl, or homeUrl)",
      };
    }

    return {
      isValid: true,
      manifest,
    };
  } catch (error) {
    return {
      isValid: false,
      manifest: null,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

