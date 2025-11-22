#!/usr/bin/env node
/**
 * Deployment script for MiniAppWeeklyBets contract
 * 
 * Usage:
 *   npm run deploy:script -- --network sepolia
 *   npm run deploy:script -- --network celo --cUSD 0x765DE816845861e75A25fCA122bb6898B8B1282a
 *   npm run deploy:script -- --network sepolia --protocolRecipient 0x...
 *   npm run deploy:script -- --network sepolia --startTime 1704067200
 */

import { execSync } from "child_process";
import { writeFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { privateKeyToAccount } from "viem/accounts";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Default start time for the contract (Unix timestamp in seconds)
 * 
 * Options:
 * - Set to a specific Unix timestamp (e.g., 1704067200 for a specific date)
 * - Set to null to use automatic previous Saturday calculation
 * - Set to a future timestamp to schedule the contract start
 * 
 * Example values:
 * - null: Automatically calculate previous Saturday 00:00 UTC
 * - 1704067200: Specific date (2024-01-01 00:00:00 UTC)
 * - Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60: 7 days from now
 */
const DEFAULT_START_TIME: number | null = null; // null = auto-calculate previous Saturday

// ============================================================================
// Network configurations
// ============================================================================
const NETWORKS = {
  celo: {
    name: "celo",
    chainId: 42220,
    cUSD: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    explorer: "https://celoscan.io",
  },
  sepolia: {
    name: "sepolia",
    chainId: 11142220,
    cUSD: process.env.SEPOLIA_CUSD_ADDRESS || "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    explorer: "https://celo-sepolia.blockscout.com",
  },
  localhost: {
    name: "localhost",
    chainId: 31337,
    cUSD: process.env.MOCK_CUSD_ADDRESS || "0x0000000000000000000000000000000000000000",
    explorer: "http://localhost:8545",
  },
} as const;

type NetworkName = keyof typeof NETWORKS;

/**
 * Ensure an address has the 0x prefix
 */
function ensure0xPrefix(address: string): string {
  if (!address) return address;
  return address.startsWith("0x") ? address : `0x${address}`;
}

/**
 * Calculate the previous Saturday 00:00 UTC from now
 */
function getPreviousSaturday(): number {
  const now = new Date();
  const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60 * 1000);
  const dayOfWeek = utcNow.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calculate days back to previous Saturday
  // Saturday is day 6
  let daysBackToSaturday: number;
  if (dayOfWeek === 6) {
    // If it's Saturday, use today at 00:00 UTC (the most recent Saturday)
    daysBackToSaturday = 0;
  } else {
    // For other days: go back (dayOfWeek + 1) days to reach the previous Saturday
    // Sunday (0) -> back 1 day, Monday (1) -> back 2 days, ..., Friday (5) -> back 6 days
    daysBackToSaturday = dayOfWeek + 1;
  }
  
  // Set to previous Saturday 00:00 UTC
  const previousSaturday = new Date(utcNow);
  previousSaturday.setUTCDate(utcNow.getUTCDate() - daysBackToSaturday);
  previousSaturday.setUTCHours(0, 0, 0, 0);
  
  return Math.floor(previousSaturday.getTime() / 1000);
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  network: NetworkName;
  cUSD?: string;
  protocolRecipient?: string;
  startTime?: number;
  initialPrice?: string;
  reset?: boolean;
} {
  const args = process.argv.slice(2);
  const result: any = {
    network: "sepolia", // default
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--network":
      case "-n":
        result.network = args[++i];
        break;
      case "--cUSD":
      case "-c":
        result.cUSD = args[++i];
        break;
      case "--protocolRecipient":
      case "-p":
        result.protocolRecipient = args[++i];
        break;
      case "--startTime":
      case "-s":
        result.startTime = parseInt(args[++i], 10);
        break;
      case "--initialPrice":
      case "-i":
        result.initialPrice = args[++i];
        break;
      case "--reset":
      case "-r":
        result.reset = true;
        break;
      case "--help":
      case "-h":
        console.log(`
Deployment script for MiniAppWeeklyBets contract

Usage:
  npm run deploy:script -- [options]

Options:
  --network, -n <name>          Network to deploy to (celo, sepolia, localhost) [default: sepolia]
  --cUSD, -c <address>          cUSD token address (optional, uses network default if not provided)
  --protocolRecipient, -p <addr> Protocol fee recipient address (optional, uses deployer if not provided)
  --startTime, -s <timestamp>   Start time (Unix timestamp) (optional, uses DEFAULT_START_TIME constant or calculates previous Saturday)
  --reset, -r                   Reset deployment state before deploying
  --help, -h                    Show this help message

Environment Variables:
  PRIVATE_KEY                   Private key of the deployer account (required)
  CELOSCAN_API_KEY             API key for contract verification (optional)

Configuration:
  DEFAULT_START_TIME            Configurable constant in the script (line 33)
                                - Set to a Unix timestamp for a fixed start time
                                - Set to null to auto-calculate previous Saturday 00:00 UTC

Examples:
  npm run deploy:script -- --network sepolia
  npm run deploy:script -- --network celo --cUSD 0x765DE816845861e75A25fCA122bb6898B8B1282a
  npm run deploy:script -- --network sepolia --protocolRecipient 0x1234... --startTime 1704067200
        `);
        process.exit(0);
        break;
    }
  }

  return result;
}

/**
 * Save deployment information to a JSON file
 */
function saveDeploymentInfo(
  network: NetworkName,
  contractAddress: string,
  params: {
    cUSD: string;
    protocolRecipient: string;
    startTime: number;
    initialPrice: string;
  }
) {
  const deploymentsDir = join(process.cwd(), "deployments");
  if (!existsSync(deploymentsDir)) {
    mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = join(deploymentsDir, `${network}.json`);
  
  let existingDeployments: any = {};
  if (existsSync(deploymentFile)) {
    try {
      existingDeployments = JSON.parse(readFileSync(deploymentFile, "utf-8"));
    } catch (e) {
      console.warn("Could not read existing deployment file, creating new one");
    }
  }

  const deployment = {
    network: network,
    chainId: NETWORKS[network].chainId,
    contractAddress: contractAddress,
    deploymentTime: new Date().toISOString(),
    parameters: {
      cUSD: params.cUSD,
      protocolRecipient: params.protocolRecipient,
      startTime: params.startTime,
      startTimeReadable: new Date(params.startTime * 1000).toISOString(),
      initialPrice: params.initialPrice,
    },
    explorer: `${NETWORKS[network].explorer}/address/${contractAddress}`,
  };

  existingDeployments[contractAddress.toLowerCase()] = deployment;
  
  // Also keep a "latest" reference
  existingDeployments.latest = deployment;

  writeFileSync(deploymentFile, JSON.stringify(existingDeployments, null, 2));
  console.log(`\n✅ Deployment info saved to ${deploymentFile}`);
}

/**
 * Main deployment function
 */
async function deploy() {
  try {
    const args = parseArgs();
    const network = args.network;

    if (!NETWORKS[network]) {
      console.error(`❌ Unknown network: ${network}`);
      console.error(`Available networks: ${Object.keys(NETWORKS).join(", ")}`);
      process.exit(1);
    }

    if (!process.env.PRIVATE_KEY) {
      console.error("❌ PRIVATE_KEY environment variable is required");
      console.error("   Please set it before running the deployment script");
      process.exit(1);
    }

    // Log private key info (masked for security)
    const privateKeyRaw = process.env.PRIVATE_KEY;
    const privateKeyHas0x = privateKeyRaw.startsWith("0x");
    console.log("\n🔍 Debug Information:");
    console.log(`   PRIVATE_KEY length: ${privateKeyRaw.length}`);
    console.log(`   PRIVATE_KEY has 0x prefix: ${privateKeyHas0x}`);
    console.log(`   PRIVATE_KEY first 10 chars: ${privateKeyRaw.substring(0, 10)}...`);

    // Derive deployer address from private key
    const privateKey = privateKeyRaw.startsWith("0x") 
      ? privateKeyRaw as `0x${string}`
      : `0x${privateKeyRaw}` as `0x${string}`;
    console.log(`   Formatted PRIVATE_KEY length: ${privateKey.length}`);
    console.log(`   Formatted PRIVATE_KEY first 10 chars: ${privateKey.substring(0, 10)}...`);
    
    const account = privateKeyToAccount(privateKey);
    const deployerAddress = account.address;
    console.log(`   Derived deployer address: ${deployerAddress}`);
    console.log(`   Deployer address has 0x: ${deployerAddress.startsWith("0x")}`);

    const networkConfig = NETWORKS[network];
    // Ensure all addresses have 0x prefix
    const cUSDRaw = args.cUSD || networkConfig.cUSD;
    const cUSD = ensure0xPrefix(cUSDRaw);
    const protocolRecipientRaw = args.protocolRecipient || deployerAddress;
    const protocolRecipient = ensure0xPrefix(protocolRecipientRaw);
    
    console.log(`   cUSD (raw): ${cUSDRaw}`);
    console.log(`   cUSD (normalized): ${cUSD}`);
    console.log(`   Protocol Recipient (raw): ${protocolRecipientRaw}`);
    console.log(`   Protocol Recipient (normalized): ${protocolRecipient}`);
    
    // Determine start time: command line arg > constant > auto-calculate previous Saturday
    let startTime: number;
    if (args.startTime) {
      startTime = args.startTime;
    } else if (DEFAULT_START_TIME !== null) {
      startTime = DEFAULT_START_TIME;
    } else {
      startTime = getPreviousSaturday();
    }

    // Determine initial price: command line arg > default (1e6 for 6-decimal tokens)
    const initialPrice = args.initialPrice || "1000000"; // Default: 1e6 (1 USDC with 6 decimals)

    console.log("\n🚀 Starting deployment...");
    console.log(`   Network: ${network} (Chain ID: ${networkConfig.chainId})`);
    console.log(`   Deployer Address: ${deployerAddress}`);
    console.log(`   cUSD Address: ${cUSD}`);
    console.log(`   Protocol Recipient: ${protocolRecipient}`);
    console.log(`   Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
    console.log(`   Initial Price: ${initialPrice}`);

    // Build command for Hardhat Ignition
    let baseCommand = `hardhat ignition deploy ignition/modules/MiniAppWeeklyBets.ts --network ${network}`;
    
    // Add parameters (always include protocolRecipient to avoid m.getAccount(0) issue)
    baseCommand += ` --parameters '{"MiniAppWeeklyBetsModule":{"cUSD":"${cUSD}","protocolRecipient":"${protocolRecipient}","startTime":${startTime},"initialPrice":${initialPrice}}}'`;

    // Reset deployment if requested
    if (args.reset) {
      // Manually delete the deployment state directory to avoid the reset prompt
      const deploymentDir = join(process.cwd(), "ignition", "deployments", `chain-${networkConfig.chainId}`);
      if (existsSync(deploymentDir)) {
        console.log("   🗑️  Deleting existing deployment state directory...");
        rmSync(deploymentDir, { recursive: true, force: true });
        console.log("   ✅ Deployment state directory deleted");
      }
      console.log("   🔄 Reset flag enabled - will deploy fresh");
    }
    
    // Pipe confirmation to auto-confirm the deployment prompt
    const command = `echo "y" | ${baseCommand}`;

    console.log("\n📝 Executing deployment command...");
    const maskedCommand = baseCommand.replace(process.env.PRIVATE_KEY || "", "[PRIVATE_KEY]");
    console.log(`   ${maskedCommand}\n`);
    console.log("   (Auto-confirming deployment prompt)\n");
    console.log("🔍 Full command details:");
    console.log(`   - Network: ${network}`);
    console.log(`   - Parameters JSON: ${JSON.stringify({
      MiniAppWeeklyBetsModule: {
        cUSD,
        protocolRecipient,
        startTime,
        initialPrice
      }
    }, null, 2)}`);
    console.log(`   - cUSD address format: ${cUSD.startsWith("0x") ? "✅ Has 0x" : "❌ Missing 0x"}`);
    console.log(`   - Protocol recipient format: ${protocolRecipient.startsWith("0x") ? "✅ Has 0x" : "❌ Missing 0x"}`);
    console.log(`   - Deployer address format: ${deployerAddress.startsWith("0x") ? "✅ Has 0x" : "❌ Missing 0x"}`);
    console.log("");

    // Execute the deployment
    // We use pipe to capture output, but will also log it
    let output = "";
    let contractAddress: string | null = null;

    try {
      // Execute with shell to handle the pipe properly
      output = execSync(command, {
        encoding: "utf-8",
        stdio: "pipe",
        cwd: process.cwd(),
        shell: "/bin/bash",
      });
      
      // Log the output so user can see it
      console.log(output);
      
      // Method 1: Try to extract from output
      const addressMatch = output.match(/0x[a-fA-F0-9]{40}/);
      if (addressMatch) {
        // Get the last match (most likely the deployed contract address)
        const addresses = output.match(/0x[a-fA-F0-9]{40}/g);
        if (addresses && addresses.length > 0) {
          // Use the last address found (usually the contract address)
          contractAddress = addresses[addresses.length - 1];
        }
      }
    } catch (error: any) {
      // Output might be in stderr
      if (error.stdout) {
        output = error.stdout;
        console.log(error.stdout);
      }
      if (error.stderr) {
        console.error(error.stderr);
        if (!output) output = error.stderr;
      }
      
      // Try to extract address even from error output
      if (output) {
        const addressMatch = output.match(/0x[a-fA-F0-9]{40}/g);
        if (addressMatch && addressMatch.length > 0) {
          contractAddress = addressMatch[addressMatch.length - 1];
        }
      }
      
      // If we still don't have an address, throw the error
      if (!contractAddress) {
        throw error;
      }
    }

    // Method 2: Try to read from Hardhat Ignition state files
    if (!contractAddress) {
      try {
        const ignitionDeploymentsDir = join(
          process.cwd(),
          "ignition",
          "deployments",
          `chain-${networkConfig.chainId}`
        );
        
        if (existsSync(ignitionDeploymentsDir)) {
          // Find the latest deployment directory
          const deploymentDirs = execSync(
            `ls -td ${ignitionDeploymentsDir}/*/ 2>/dev/null | head -1`,
            { encoding: "utf-8", shell: "/bin/bash" }
          ).trim();
          
          if (deploymentDirs) {
            const deploymentFile = join(
              deploymentDirs,
              "deployed_addresses.json"
            );
            
            if (existsSync(deploymentFile)) {
              const deploymentData = JSON.parse(
                readFileSync(deploymentFile, "utf-8")
              );
              
              // Extract contract address from deployment data
              // Format: {"MiniAppWeeklyBetsModule#miniAppWeeklyBets": "0x..."}
              const moduleKey = "MiniAppWeeklyBetsModule#miniAppWeeklyBets";
              if (deploymentData[moduleKey]) {
                contractAddress = deploymentData[moduleKey];
              } else {
                // Try to find any address in the deployment data
                const addresses = Object.values(deploymentData);
                if (addresses.length > 0 && typeof addresses[0] === "string") {
                  contractAddress = addresses[0] as string;
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors when reading state files
        console.warn("\n⚠️  Could not read from Ignition state files");
      }
    }

    if (contractAddress) {
      console.log(`\n✅ Contract deployed successfully!`);
      console.log(`   Address: ${contractAddress}`);
      console.log(`   Explorer: ${networkConfig.explorer}/address/${contractAddress}`);

      // Save deployment info
      saveDeploymentInfo(network, contractAddress, {
        cUSD,
        protocolRecipient: protocolRecipient || "deployer",
        startTime,
        initialPrice,
      });

      console.log(`\n💡 To verify the contract, run:`);
      const verifyParams = protocolRecipient
        ? `${cUSD} ${protocolRecipient} ${startTime} ${initialPrice}`
        : `${cUSD} <deployer_address> ${startTime} ${initialPrice}`;
      console.log(
        `   npx hardhat verify --network ${network} ${contractAddress} ${verifyParams}`
      );
    } else {
      console.log("\n⚠️  Could not automatically extract contract address");
      console.log("   Please check the output above for the deployment address");
      console.log("   The address should be in the format: 0x...");
      console.log("\n   You can also find it in:");
      console.log(
        `   ignition/deployments/chain-${networkConfig.chainId}/<deployment-id>/deployed_addresses.json`
      );
    }

    console.log("\n✨ Deployment process completed!\n");
  } catch (error: any) {
    console.error("\n❌ Deployment failed:");
    if (error.stdout) {
      console.error(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    console.error(error.message);
    process.exit(1);
  }
}

// Run the deployment
deploy();

