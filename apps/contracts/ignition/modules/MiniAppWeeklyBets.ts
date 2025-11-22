// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// cUSD addresses on different networks
// Celo Mainnet: 0x765DE816845861e75A25fCA122bb6898B8B1282a
// Alfajores: 0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1
// Sepolia: Check Celo Sepolia testnet for cUSD address

const MiniAppWeeklyBetsModule = buildModule("MiniAppWeeklyBetsModule", (m: any) => {
  // Get parameters with defaults
  const cUSD = m.getParameter(
    "cUSD",
    "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1" // Default to Alfajores testnet
  );
  
  const protocolRecipient = m.getParameter(
    "protocolRecipient",
    m.getAccount(0) // Default to deployer account
  );
  
  // Default startTime: Next Monday 00:00 UTC
  // You can calculate this: Math.floor(Date.now() / 1000) + days until next Monday
  const startTime = m.getParameter(
    "startTime",
    Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // Default: 7 days from now (adjust as needed)
  );

  const miniAppWeeklyBets = m.contract("MiniAppWeeklyBets", [
    cUSD,
    protocolRecipient,
    startTime,
  ]);

  return { miniAppWeeklyBets };
});

export default MiniAppWeeklyBetsModule;

