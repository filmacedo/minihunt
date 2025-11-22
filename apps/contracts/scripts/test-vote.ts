#!/usr/bin/env node
/**
 * Test script to vote on a mini app in the contract and submit to the API
 * 
 * Usage:
 *   npm run test-vote
 *   PRIVATE_KEY=0x... npm run test-vote
 *   API_URL=http://localhost:3000 npm run test-vote
 */

import { createPublicClient, createWalletClient, http, keccak256, stringToHex, parseEther, type Address, type Hash } from "viem";
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
const abiPath = join(__dirname, "../../web/src/lib/abis/mini-app-weekly-bets.json");
const MINI_APP_WEEKLY_BETS_ABI = JSON.parse(readFileSync(abiPath, "utf-8")) as Abi;

// Configuration
const CELO_SEPOLIA_RPC = process.env.CELO_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";
const CONTRACT_ADDRESS = (process.env.MINI_APP_WEEKLY_BETS_ADDRESS || "0x272ab20E6AF4FbF2b87B93d842288f8Bd5756f2c") as Address;
const CUSD_ADDRESS = "0x01C5C0122039549AD1493B8220cABEdD739BC44E" as Address;
const MINI_APP_URL = "https://celo.builderscore.xyz/";
const FID = 253890;
const API_URL = process.env.API_URL || "http://localhost:3000";

// ERC20 ABI (minimal - just approve, balanceOf, allowance, and decimals)
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

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

  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey as `0x${string}` : `0x${privateKey}`);

  console.log("🔐 Using account:", account.address);
  console.log("📝 Mini App URL:", MINI_APP_URL);
  console.log("📋 FID:", FID);
  console.log("🔗 Contract:", CONTRACT_ADDRESS);
  console.log("💵 cUSD Token:", CUSD_ADDRESS);
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

  // Get token decimals
  const decimals = await publicClient.readContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  }) as number;

  console.log("🔢 cUSD Decimals:", decimals);
  console.log("");

  // Check balance
  const balance = await publicClient.readContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  const decimalsDivisor = BigInt(10 ** decimals);
  const balanceFormatted = (Number(balance) / Number(decimalsDivisor)).toFixed(6);
  
  console.log("💰 cUSD Balance:", balance.toString(), "units");
  console.log("   (", balanceFormatted, "cUSD)");
  console.log("");

  // Check current price (get initial price from contract)
  // Note: Contract's initialPrice is updatable and has no decimals assumption
  const initialPrice = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: WEEKLY_BETS_ABI,
    functionName: "initialPrice",
  }) as bigint;

  // Note: Contract's initialPrice is updatable and has no decimals assumption
  // The owner can set it to match the token's decimals
  console.log("ℹ️  Token has", decimals, "decimals. Contract's initialPrice is", initialPrice.toString(), "token units.");
  console.log("   (Owner can update initialPrice via setInitialPrice() to match token decimals)");
  console.log("");

  // The contract will transfer INITIAL_PRICE (1e18) units
  // If token has 6 decimals: 1e18 units = 1e12 cUSD (1 trillion cUSD!)
  // If token has 18 decimals: 1e18 units = 1 cUSD
  const priceInCUSD = Number(initialPrice) / Number(decimalsDivisor);
  
  console.log("💸 Initial Price (contract will transfer):", initialPrice.toString(), "token units");
  console.log("💸 Initial Price (in cUSD):", priceInCUSD.toFixed(6), "cUSD");
  console.log("");

  // Check if balance is sufficient
  // The contract will transfer `initialPrice` amount in token units
  if (balance < initialPrice) {
    const needed = initialPrice - balance;
    const neededFormatted = (Number(needed) / Number(decimalsDivisor)).toFixed(6);
    const requiredFormatted = priceInCUSD.toFixed(6);
    
    throw new Error(
      `❌ Insufficient cUSD balance!\n` +
      `   Current balance: ${balanceFormatted} cUSD\n` +
      `   Required: ${requiredFormatted} cUSD (contract will transfer ${initialPrice.toString()} token units)\n` +
      `   Need to add: ${neededFormatted} cUSD\n` +
      `   Token decimals: ${decimals}\n` +
      `   Please fund your account (${account.address}) with sufficient cUSD to vote.`
    );
  }
  
  console.log("✅ Balance is sufficient for voting!");
  console.log("");

  // Check allowance
  const allowance = await publicClient.readContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, CONTRACT_ADDRESS],
  });

  const approvalAmount = parseEther("100"); // Approve 100 cUSD for multiple votes

  if (allowance < initialPrice) {
    console.log("🔓 Approving cUSD...");
    const approveHash = await walletClient.writeContract({
      address: CUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, approvalAmount],
    });

    console.log("⏳ Waiting for approval transaction...");
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log("✅ Approval confirmed:", approveHash);
    console.log("");
  } else {
    console.log("✅ Already approved (allowance:", allowance.toString(), "wei)");
    console.log("");
  }

  // Vote on the contract
  console.log("🗳️  Voting on contract...");
  const voteHash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: WEEKLY_BETS_ABI,
    functionName: "vote",
    args: [appHash, MINI_APP_URL],
  });

  console.log("⏳ Waiting for vote transaction...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: voteHash });
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
  console.log("🎉 All done! Vote has been submitted to both the contract and the API.");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});

