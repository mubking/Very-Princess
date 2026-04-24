/**
 * @file statsController.ts
 * @description Business logic for platform-wide statistics aggregation.
 *
 * Stats are derived from on-chain state via stellarService.
 * No Prisma / database layer exists in this project — all data lives on Stellar.
 */

import { stellarService } from "../services/stellarService.js";

export interface GlobalStatsResponse {
  /** Number of registered organizations on-chain. */
  totalOrganizations: number;
  /** Sum of all org budgets currently held in the contract (stroops). */
  totalFundedStroops: string;
  /** Same value expressed in whole XLM. */
  totalFundedXlm: string;
  /** Sum of all maintainer claimable balances (stroops). */
  totalClaimedStroops: string;
  /** Same value expressed in whole XLM. */
  totalClaimedXlm: string;
  /** ISO timestamp of when this result was computed. */
  cachedAt: string;
  /** ISO timestamp of when the cache will expire. */
  cacheExpiresAt: string;
}

function stroopsToXlm(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(7);
}

export const statsController = {
  async getGlobalStats(): Promise<GlobalStatsResponse> {
    const orgs = await stellarService.readAllOrganizations();

    let totalFunded = 0n;
    let totalClaimed = 0n;

    await Promise.all(
      orgs.map(async (orgId) => {
        const [budget, maintainers] = await Promise.all([
          stellarService.readOrgBudget(orgId),
          stellarService.readMaintainers(orgId),
        ]);

        totalFunded += BigInt(budget);

        const balances = await Promise.all(
          maintainers.map((m) => stellarService.readClaimableBalance(m))
        );
        for (const b of balances) totalClaimed += BigInt(b);
      })
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);

    return {
      totalOrganizations: orgs.length,
      totalFundedStroops: totalFunded.toString(),
      totalFundedXlm: stroopsToXlm(totalFunded),
      totalClaimedStroops: totalClaimed.toString(),
      totalClaimedXlm: stroopsToXlm(totalClaimed),
      cachedAt: now.toISOString(),
      cacheExpiresAt: expiresAt.toISOString(),
    };
  },
} as const;