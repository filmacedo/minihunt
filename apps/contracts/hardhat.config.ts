import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { config as dotenvConfig } from "dotenv";

// Load environment variables from .env file
// Hardhat should auto-load .env, but explicitly loading it ensures it works
dotenvConfig();

// Helper to format private key with 0x prefix
function formatPrivateKey(key: string | undefined): string {
  if (!key) return "";
  const formatted = key.startsWith("0x") ? key : `0x${key}`;
  console.log(`[Hardhat Config] PRIVATE_KEY length: ${key.length}, formatted length: ${formatted.length}`);
  return formatted;
}

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  // @ts-ignore - mocha config is valid but types may not include it
  mocha: {
    timeout: 40000,
  },
  networks: {
    // Celo Mainnet
    celo: {
      type: "http",
      url: "https://forno.celo.org",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`]
        : [],
      chainId: 42220,
    },
    // Celo Sepolia Testnet
    sepolia: {
      type: "http",
      url: "https://forno.celo-sepolia.celo-testnet.org",
      accounts: (() => {
        const privateKey = formatPrivateKey(process.env.PRIVATE_KEY);
        if (privateKey) {
          console.log(`[Hardhat Config] Sepolia network: Using private key (first 10 chars: ${privateKey.substring(0, 10)}...)`);
          // Note: Can't use require in ES modules, but the address will be derived correctly by Hardhat
          return [privateKey];
        }
        console.log(`[Hardhat Config] Sepolia network: No private key provided`);
        return [];
      })(),
      chainId: 11142220,
    },
    // Local development
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    // For CELO mainnet verification on Celoscan, set ETHERSCAN_API_KEY environment variable
    // Get your API key from: https://celoscan.io/myapikey
    // Note: Celo uses ETHERSCAN_API_KEY (not CELOSCAN_API_KEY) per official documentation
    apiKey: (() => {
      const apiKey = process.env.ETHERSCAN_API_KEY || process.env.CELOSCAN_API_KEY || "";
      if (apiKey) {
        console.log(`[Hardhat Config] Etherscan API key loaded (first 10 chars: ${apiKey.substring(0, 10)}...)`);
      } else {
        console.log(`[Hardhat Config] Etherscan API key not found. ETHERSCAN_API_KEY=${process.env.ETHERSCAN_API_KEY}, CELOSCAN_API_KEY=${process.env.CELOSCAN_API_KEY ? "set" : "not set"}`);
      }
      return apiKey;
    })(),
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://celoscan.io/",
        },
      },
      {
        network: "sepolia",
        chainId: 11142220,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://sepolia.celoscan.io",
        },
      },
    ],
  },
});
