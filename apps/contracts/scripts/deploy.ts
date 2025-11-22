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
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Default start time for the contract (Unix timestamp in seconds)
 * 
 * Options:
 * - Set to a specific Unix timestamp (e.g., 1704067200 for a specific date)
 * - Set to null to use automatic next Monday calculation
 * - Set to a future timestamp to schedule the contract start
 * 
 * Example values:
 * - null: Automatically calculate next Monday 00:00 UTC
 * - 1704067200: Specific date (2024-01-01 00:00:00 UTC)
 * - Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60: 7 days from now
 */
const DEFAULT_START_TIME: number | null = null; // null = auto-calculate next Monday

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
    cUSD: process.env.SEPOLIA_CUSD_ADDRESS || "0x0000000000000000000000000000000000000000", // Update with actual address
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
 * Calculate the next Monday 00:00 UTC from now
 */
function getNextMonday(): number {
  const now = new Date();
  const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60 * 1000);
  const dayOfWeek = utcNow.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days until next Monday
  let daysUntilMonday = (8 - dayOfWeek) % 7;
  if (daysUntilMonday === 0) {
    // If it's Monday, check if we're past 00:00 UTC
    if (utcNow.getUTCHours() === 0 && utcNow.getUTCMinutes() === 0 && utcNow.getUTCSeconds() === 0) {
      daysUntilMonday = 0; // Use current Monday
    } else {
      daysUntilMonday = 7; // Use next Monday
    }
  }
  
  // Set to next Monday 00:00 UTC
  const nextMonday = new Date(utcNow);
  nextMonday.setUTCDate(utcNow.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  
  return Math.floor(nextMonday.getTime() / 1000);
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  network: NetworkName;
  cUSD?: string;
  protocolRecipient?: string;
  startTime?: number;
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
  --startTime, -s <timestamp>   Start time (Unix timestamp) (optional, uses DEFAULT_START_TIME constant or calculates next Monday)
  --reset, -r                   Reset deployment state before deploying
  --help, -h                    Show this help message

Environment Variables:
  PRIVATE_KEY                   Private key of the deployer account (required)
  CELOSCAN_API_KEY             API key for contract verification (optional)

Configuration:
  DEFAULT_START_TIME            Configurable constant in the script (line 33)
                                - Set to a Unix timestamp for a fixed start time
                                - Set to null to auto-calculate next Monday 00:00 UTC

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

    const networkConfig = NETWORKS[network];
    const cUSD = args.cUSD || networkConfig.cUSD;
    const protocolRecipient = args.protocolRecipient || ""; // Empty means use deployer (handled by ignition)
    
    // Determine start time: command line arg > constant > auto-calculate next Monday
    let startTime: number;
    if (args.startTime) {
      startTime = args.startTime;
    } else if (DEFAULT_START_TIME !== null) {
      startTime = DEFAULT_START_TIME;
    } else {
      startTime = getNextMonday();
    }

    console.log("\n🚀 Starting deployment...");
    console.log(`   Network: ${network} (Chain ID: ${networkConfig.chainId})`);
    console.log(`   cUSD Address: ${cUSD}`);
    console.log(`   Protocol Recipient: ${protocolRecipient || "Deployer address"}`);
    console.log(`   Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()})`);

    // Build command for Hardhat Ignition
    let command = `hardhat ignition deploy ignition/modules/MiniAppWeeklyBets.ts --network ${network}`;
    
    // Add parameters
    command += ` --parameters '{"MiniAppWeeklyBetsModule":{"cUSD":"${cUSD}","startTime":${startTime}`;
    if (protocolRecipient) {
      command += `,"protocolRecipient":"${protocolRecipient}"`;
    }
    command += `}}'`;

    // Reset deployment if requested
    if (args.reset) {
      command += " --reset";
      console.log("   🔄 Reset flag enabled - will reset previous deployment state");
    }

    console.log("\n📝 Executing deployment command...");
    console.log(`   ${command.replace(process.env.PRIVATE_KEY || "", "[PRIVATE_KEY]")}\n`);

    // Execute the deployment
    // We use pipe to capture output, but will also log it
    let output = "";
    let contractAddress: string | null = null;

    try {
      output = execSync(command, {
        encoding: "utf-8",
        stdio: "pipe",
        cwd: process.cwd(),
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
      });

      console.log(`\n💡 To verify the contract, run:`);
      const verifyParams = protocolRecipient
        ? `${cUSD} ${protocolRecipient} ${startTime}`
        : `${cUSD} <deployer_address> ${startTime}`;
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

