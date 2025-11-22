import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

type UserRecord = {
  id: string; // Supabase returns IDs as strings
  created_at: string;
  name: string | null;
  bio: string | null;
  profile_image_url: string | null;
};

type UserInsert = {
  id?: string | number; // Can be set as number (FID) or string
  created_at?: string;
  name?: string | null;
  bio?: string | null;
  profile_image_url?: string | null;
};

const client = getSupabaseServerClient();

/**
 * Fetch user information from Neynar API by FID
 */
async function fetchUserFromNeynar(fid: number): Promise<UserInsert | null> {
  if (!env.NEYNAR_API_KEY) {
    console.warn("NEYNAR_API_KEY not configured, cannot fetch user info");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "x-api-key": env.NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Neynar API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const users = data.users || [];

    if (users.length === 0) {
      console.warn(`No user found for FID ${fid}`);
      return null;
    }

    const user = users[0];
    
    return {
      id: fid, // Use numeric FID as ID
      name: user.display_name || user.username || null,
      bio: user.profile?.bio?.text || null,
      profile_image_url: user.pfp_url || null,
    };
  } catch (error) {
    console.error(`Failed to fetch user ${fid} from Neynar:`, error);
    return null;
  }
}

/**
 * Ensure a user exists in the database. If not, fetch from Neynar and create.
 * Returns the user record (existing or newly created).
 */
export async function ensureUserExists(fid: number): Promise<UserRecord> {
  // Check if user already exists
  const { data: existingUser } = await client
    .from("users")
    .select("*")
    .eq("id", fid.toString())
    .maybeSingle();

  if (existingUser) {
    const userRecord = existingUser as UserRecord;
    
    // Check if user has no metadata (all fields are null)
    const hasNoMetadata = !userRecord.name && !userRecord.bio && !userRecord.profile_image_url;
    
    if (hasNoMetadata) {
      // Try to fetch metadata from Neynar and update the user
      const userData = await fetchUserFromNeynar(fid);
      
      if (userData && (userData.name || userData.bio || userData.profile_image_url)) {
        // Update the user with fetched metadata
        const { data: updatedUser, error: updateError } = await client
          .from("users")
          .update({
            name: userData.name,
            bio: userData.bio,
            profile_image_url: userData.profile_image_url,
          })
          .eq("id", fid.toString())
          .select()
          .single();
        
        if (!updateError && updatedUser) {
          return updatedUser as UserRecord;
        }
        // If update fails, log but return the existing user
        console.warn(`Failed to update user ${fid} metadata:`, updateError);
      }
    }
    
    return userRecord;
  }

  // User doesn't exist, fetch from Neynar
  const userData = await fetchUserFromNeynar(fid);

  if (!userData) {
    // If we can't fetch from Neynar, create a minimal user record
    // Note: We try to set id to FID since foreign keys reference users(id) as FID
    // If the database uses GENERATED ALWAYS AS IDENTITY, this will fail and we'll need to adjust
    const { data: newUser, error } = await client
      .from("users")
      .insert({
        id: fid, // Use numeric FID as ID
        name: null,
        bio: null,
        profile_image_url: null,
      })
      .select()
      .single();

    if (error) {
      // If setting ID fails (e.g., GENERATED ALWAYS AS IDENTITY), try without ID
      // and then update the record if needed, or handle the error appropriately
      console.error(`Failed to create user with ID ${fid}:`, error);
      throw new Error(`Failed to create user: ${error.message}`);
    }

    if (!newUser) {
      throw new Error("Failed to create user: No data returned");
    }

    return newUser as UserRecord;
  }

  // Insert user with data from Neynar
  // Note: We try to set id to FID since foreign keys reference users(id) as FID
  const { data: newUser, error } = await client
    .from("users")
    .insert({
      id: userData.id!,
      name: userData.name,
      bio: userData.bio,
      profile_image_url: userData.profile_image_url,
    })
    .select()
    .single();

  if (error) {
    // If insert fails (e.g., duplicate key), try to fetch the existing user
    if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
      const { data: existingUser } = await client
        .from("users")
        .select("*")
        .eq("id", fid.toString())
        .maybeSingle();

      if (existingUser) {
        return existingUser as UserRecord;
      }
    }
    throw new Error(`Failed to create user: ${error.message}`);
  }

  if (!newUser) {
    throw new Error("Failed to create user: No data returned");
  }

  return newUser as UserRecord;
}

