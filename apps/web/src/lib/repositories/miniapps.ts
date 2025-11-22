import "server-only";

import type { Database } from "@/lib/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type MiniAppTable = Database["public"]["Tables"]["mini_apps"];

export type MiniAppRecord = MiniAppTable["Row"];
export type MiniAppInsert = MiniAppTable["Insert"];

const client = getSupabaseServerClient();

export async function listMiniApps(limit = 50): Promise<MiniAppRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await client
    .from("mini_apps")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Failed to load mini apps: ${error.message}`);
  }

  return (data as MiniAppRecord[]) ?? [];
}

export async function createMiniApp(payload: MiniAppInsert): Promise<MiniAppRecord> {
  const { data, error } = await client.from("mini_apps").insert(payload).select().single();

  if (error) {
    throw new Error(`Failed to create mini app: ${error.message}`);
  }

  if (!data) {
    throw new Error("Failed to create mini app: No data returned");
  }

  return data as MiniAppRecord;
}

