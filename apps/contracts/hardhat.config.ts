import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

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
    apiKey: {
      celo: process.env.CELOSCAN_API_KEY || "",
      sepolia: process.env.CELOSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
      {
        network: "sepolia",
        chainId: 11142220,
        urls: {
          apiURL: "https://api-celo-sepolia.blockscout.com/api",
          browserURL: "https://celo-sepolia.blockscout.com",
        },
      },
    ],
  },
});
