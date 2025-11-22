import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

type ServerSupabaseClient = SupabaseClient<Database>;

declare global {
  // eslint-disable-next-line no-var
  var __supabaseServerClient__: ServerSupabaseClient | undefined;
}

function ensureServerEnv(): { url: string; key: string } {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured. Set it in apps/web/.env.local.");
  }

  if (!env.SUPABASE_KEY) {
    throw new Error("SUPABASE_KEY is not configured. Set it in apps/web/.env.local.");
  }

  return {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_KEY,
  };
}

function createServerClient(): ServerSupabaseClient {
  const { url, key } = ensureServerEnv();

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseServerClient(): ServerSupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("Supabase server client can only be used in a server-side context.");
  }

  if (!globalThis.__supabaseServerClient__) {
    globalThis.__supabaseServerClient__ = createServerClient();
  }

  return globalThis.__supabaseServerClient__;
}

