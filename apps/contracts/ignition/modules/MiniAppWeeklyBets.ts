// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MiniAppWeeklyBetsModule = buildModule("MiniAppWeeklyBetsModule", (m: any) => {
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

  // Default initialPrice: 1e17 (0.1 CELO with 18 decimals)
  // Can be overridden to match different price if needed
  const initialPrice = m.getParameter(
    "initialPrice",
    BigInt("100000000000000000") // Default: 1e17 (0.1 CELO with 18 decimals)
  );

  const miniAppWeeklyBets = m.contract("MiniAppWeeklyBets", [
    protocolRecipient,
    startTime,
    initialPrice,
  ]);

  return { miniAppWeeklyBets };
});

export default MiniAppWeeklyBetsModule;

