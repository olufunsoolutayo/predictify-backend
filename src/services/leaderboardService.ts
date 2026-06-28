import {
  refreshAddressAggregates,
  getAddressAggregates,
  getAddressAggregate,
  getAddressAggregatesWithRefresh,
  type AddressAggregate,
} from "./addressAggregatesService";

export type LeaderboardEntry = AddressAggregate;

/**
 * Refresh the address aggregates materialized view.
 * Delegates to the shared service which runs CONCURRENTLY.
 */
export async function refreshLeaderboard(): Promise<void> {
  await refreshAddressAggregates();
}

/**
 * Get the leaderboard with optional limit and offset.
 * Reads from address_aggregates_mv.
 */
export async function getLeaderboard(
  limit: number = 50,
  offset: number = 0
): Promise<LeaderboardEntry[]> {
  return getAddressAggregates(limit, offset);
}

/**
 * Get a specific user's leaderboard entry by stellar address.
 */
export async function getUserLeaderboardEntry(
  stellarAddress: string
): Promise<LeaderboardEntry | null> {
  return getAddressAggregate(stellarAddress);
}

/**
 * Get leaderboard with automatic refresh before returning data.
 */
export async function getLeaderboardWithRefresh(
  limit: number = 50,
  offset: number = 0
): Promise<LeaderboardEntry[]> {
  return getAddressAggregatesWithRefresh(limit, offset);
}
