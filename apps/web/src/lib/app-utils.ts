import { formatUnits } from "viem";

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Format USDC amount (6 decimals) with max 2 decimal places
 */
export function formatUSDC(amount: bigint | string): string {
  const amountBigInt = typeof amount === "string" ? BigInt(amount) : amount;
  const formatted = formatUnits(amountBigInt, 6); // USDC has 6 decimals
  const num = parseFloat(formatted);

  // Format with max 2 decimals, removing trailing zeros
  const fixed = num.toFixed(2);
  // Remove trailing zeros and decimal point if not needed
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Truncate an address for display
 */
export function truncateAddress(
  address: string,
  startLength = 6,
  endLength = 4
): string {
  if (address.length <= startLength + endLength) {
    return address;
  }
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
