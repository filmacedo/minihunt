import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatUnits } from 'viem';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a BigInt value to a string with exactly 2 decimal places
 * @param value - The BigInt value to format
 * @param decimals - The number of decimals (default: 18 for CELO)
 * @returns A string with the formatted number (e.g., "123.45")
 */
export function formatUnitsFixed(value: bigint, decimals: number = 18): string {
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);
  
  // Handle edge cases
  if (isNaN(num)) return "0.00";
  if (num === 0) return "0.00";
  
  // Format to exactly 2 decimal places
  return num.toFixed(2);
}
