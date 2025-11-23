#!/usr/bin/env node
/**
 * Test script to vote on a mini app in the contract and submit to the API
 *
 * Usage:
 *   npm run test-vote
 *   PRIVATE_KEY=0x... npm run test-vote
 *   API_URL=http://localhost:3000 npm run test-vote
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  formatEther,
  parseEther,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Abi } from "viem";

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABI from web app (relative to contracts/scripts directory)
// From apps/contracts/scripts/ -> go up to apps/ -> then into web/
const abiPath = join(
  __dirname,
  "../../web/src/lib/abis/mini-app-weekly-bets.json"
);
const MINI_APP_WEEKLY_BETS_ABI = JSON.parse(
  readFileSync(abiPath, "utf-8")
) as Abi;

// Configuration
const CELO_SEPOLIA_RPC =
  process.env.CELO_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";
const CONTRACT_ADDRESS = (process.env.MINI_APP_WEEKLY_BETS_ADDRESS ||
  "0x272ab20E6AF4FbF2b87B93d842288f8Bd5756f2c") as Address;
const MINI_APP_URL = "https://celo.builderscore.xyz/";
const FID = 253890;
const API_URL = process.env.API_URL || "http://localhost:3000";

const WEEKLY_BETS_ABI = MINI_APP_WEEKLY_BETS_ABI as Abi;

// Celo Sepolia chain configuration
const celoSepolia = {
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "CELO",
    symbol: "CELO",
  },
  rpcUrls: {
    default: {
      http: [CELO_SEPOLIA_RPC],
    },
    public: {
      http: [CELO_SEPOLIA_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://celo-sepolia.blockscout.com",
    },
  },
} as const;

/**
 * Get app hash from URL
 */
function getAppHash(url: string): `0x${string}` {
  return keccak256(stringToHex(url));
}

/**
 * Submit vote to API endpoint
 */
async function submitVoteToAPI(txHash: Hash, fid: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/miniapps/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_hash: txHash,
      fid: fid,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API request failed: ${JSON.stringify(error)}`);
  }

  const result = await response.json();
  console.log("✅ Vote submitted to API successfully:");
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  // Check for private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  const account = privateKeyToAccount(
    privateKey.startsWith("0x")
      ? (privateKey as `0x${string}`)
      : `0x${privateKey}`
  );

  console.log("🔐 Using account:", account.address);
  console.log("📝 Mini App URL:", MINI_APP_URL);
  console.log("📋 FID:", FID);
  console.log("🔗 Contract:", CONTRACT_ADDRESS);
  console.log("🌐 API URL:", API_URL);
  console.log("");

  // Create clients
  const publicClient = createPublicClient({
    transport: http(CELO_SEPOLIA_RPC),
    chain: celoSepolia,
  });

  const walletClient = createWalletClient({
    account,
    transport: http(CELO_SEPOLIA_RPC),
    chain: celoSepolia,
  });

  // Calculate app hash
  const appHash = getAppHash(MINI_APP_URL);
  console.log("🔑 App Hash:", appHash);
  console.log("");

  // Check native CELO balance
  const balance = await publicClient.getBalance({
    address: account.address,
  });

  const balanceFormatted = formatEther(balance);

  console.log("💰 CELO Balance:", balance.toString(), "wei");
  console.log("   (", balanceFormatted, "CELO)");
  console.log("");

  // Get initial price from contract
  // Note: Contract's initialPrice is in wei (18 decimals for native CELO)
  const initialPrice = (await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: WEEKLY_BETS_ABI,
    functionName: "initialPrice",
  })) as bigint;

  const priceInCELO = formatEther(initialPrice);

  console.log(
    "💸 Initial Price (contract will transfer):",
    initialPrice.toString(),
    "wei"
  );
  console.log("💸 Initial Price (in CELO):", priceInCELO, "CELO");
  console.log("");

  // Check if balance is sufficient
  // The contract will transfer `initialPrice` amount in wei
  if (balance < initialPrice) {
    const needed = initialPrice - balance;
    const neededFormatted = formatEther(needed);
    const requiredFormatted = priceInCELO;

    throw new Error(
      `❌ Insufficient CELO balance!\n` +
        `   Current balance: ${balanceFormatted} CELO\n` +
        `   Required: ${requiredFormatted} CELO (contract will transfer ${initialPrice.toString()} wei)\n` +
        `   Need to add: ${neededFormatted} CELO\n` +
        `   Please fund your account (${account.address}) with sufficient CELO to vote.`
    );
  }

  console.log("✅ Balance is sufficient for voting!");
  console.log("");

  // Vote on the contract (send native CELO)
  console.log("🗳️  Voting on contract...");
  const voteHash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: WEEKLY_BETS_ABI,
    functionName: "vote",
    args: [appHash, MINI_APP_URL],
    value: initialPrice, // Send native CELO
  });

  console.log("⏳ Waiting for vote transaction...");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: voteHash,
  });
  console.log("✅ Vote transaction confirmed:", voteHash);
  console.log("📊 Transaction receipt:", {
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
  });
  console.log("");

  // Submit to API
  console.log("📤 Submitting vote to API...");
  await submitVoteToAPI(voteHash, FID);

  console.log("");
  console.log(
    "🎉 All done! Vote has been submitted to both the contract and the API."
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
