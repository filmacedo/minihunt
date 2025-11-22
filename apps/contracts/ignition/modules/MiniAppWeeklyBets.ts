// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// USDC addresses on different networks
// Celo Mainnet: 0x765DE816845861e75A25fCA122bb6898B8B1282a (cUSD)
// Celo Sepolia: 0x01C5C0122039549AD1493B8220cABEdD739BC44E (USDC)

const MiniAppWeeklyBetsModule = buildModule("MiniAppWeeklyBetsModule", (m: any) => {
  // Get parameters with defaults
  // Default USDC address for Celo Sepolia (can be overridden via deployment parameters)
  const cUSD = m.getParameter(
    "cUSD",
    "0x01C5C0122039549AD1493B8220cABEdD739BC44E" // Celo Sepolia USDC address
  );
  
  // protocolRecipient - default to deployer account (index 0) if not provided
  // This ensures the deployer is always used when no parameter is passed
  const protocolRecipient = m.getParameter("protocolRecipient", m.getAccount(0));
  
  // Default startTime: Previous Saturday 00:00 UTC
  // The deployment script will calculate and pass the previous Saturday automatically
  // This default is just a fallback placeholder
  const startTime = m.getParameter(
    "startTime",
    Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60 // Default: 7 days ago (fallback only)
  );

  // Default initialPrice: 1e6 (1 USDC with 6 decimals)
  // Can be overridden to match token decimals if different
  const initialPrice = m.getParameter(
    "initialPrice",
    BigInt("1000000") // Default: 1e6 (1 USDC with 6 decimals)
  );

  const miniAppWeeklyBets = m.contract("MiniAppWeeklyBets", [
    cUSD,
    protocolRecipient,
    startTime,
    initialPrice,
  ]);

  return { miniAppWeeklyBets };
});

export default MiniAppWeeklyBetsModule;

