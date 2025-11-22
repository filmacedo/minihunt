import { keccak256, stringToHex } from "viem";
import { normalizeUrl } from "./miniapp-utils";

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

/**
 * Calculate app hash from URL (matches contract's keccak256(normalizedUrl))
 */
export function calculateAppHash(url: string): `0x${string}` {
  const normalizedUrl = normalizeUrl(url);
  return keccak256(stringToHex(normalizedUrl));
}
