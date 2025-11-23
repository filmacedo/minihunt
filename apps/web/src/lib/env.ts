import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// https://env.t3.gg/docs/nextjs
export const env = createEnv({
  server: {
    JWT_SECRET: z.string().min(1).optional().default("build-time-placeholder"),
    // NEYNAR_API_KEY is optional - can be undefined, empty string, or a valid API key
    NEYNAR_API_KEY: z.string().optional(),
    SUPABASE_URL: z
      .string()
      .url()
      .optional()
      .default("https://mvrirfxzkmtgddmkatnc.supabase.co"),
    SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required"),
    MINI_APP_WEEKLY_BETS_ADDRESS: z
      .string()
      .regex(
        /^0x[a-fA-F0-9]{40}$/,
        "MINI_APP_WEEKLY_BETS_ADDRESS must be a valid address"
      ),
    CELO_RPC_URL: z
      .string()
      .url()
      .optional()
      .default("https://forno.celo.org"),
  },
  client: {
    NEXT_PUBLIC_URL: z
      .string()
      .min(1)
      .optional()
      .default("http://localhost:3000"),
    NEXT_PUBLIC_APP_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("development"),
    NEXT_PUBLIC_FARCASTER_HEADER: z
      .string()
      .min(1)
      .optional()
      .default("build-time-placeholder"),
    NEXT_PUBLIC_FARCASTER_PAYLOAD: z
      .string()
      .min(1)
      .optional()
      .default("build-time-placeholder"),
    NEXT_PUBLIC_FARCASTER_SIGNATURE: z
      .string()
      .min(1)
      .optional()
      .default("build-time-placeholder"),
    NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid contract address")
      .optional()
      .default("0x0000000000000000000000000000000000000000"),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_FARCASTER_HEADER: process.env.NEXT_PUBLIC_FARCASTER_HEADER,
    NEXT_PUBLIC_FARCASTER_PAYLOAD: process.env.NEXT_PUBLIC_FARCASTER_PAYLOAD,
    NEXT_PUBLIC_FARCASTER_SIGNATURE:
      process.env.NEXT_PUBLIC_FARCASTER_SIGNATURE,
    NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS:
      process.env.NEXT_PUBLIC_MINI_APP_WEEKLY_BETS_ADDRESS,
  },
});
