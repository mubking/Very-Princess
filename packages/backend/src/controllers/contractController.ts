/**
 * @file contractController.ts
 * @description Business logic layer for PayoutRegistry contract interactions.
 *
 * Controllers sit between the HTTP route layer and the service layer.
 * Each method on this controller corresponds to a logical operation that
 * the API exposes — it validates input, calls the service, and shapes the
 * response.
 *
 * ## Adding a New Operation
 *
 * 1. Add the corresponding function to `StellarService` in `stellarService.ts`.
 * 2. Add a new method here that calls it and returns a typed result.
 * 3. Wire a new route in `routes/contract.ts`.
 */

import { stellarService } from "../services/stellarService.js";

// ─── Response Types ───────────────────────────────────────────────────────────

export interface OrgResponse {
  id: string;
  name: string;
  admin: string;
}

export interface MaintainersResponse {
  orgId: string;
  maintainers: string[];
  count: number;
}

export interface BalanceResponse {
  maintainer: string;
  claimableStroops: string; // returned as string to safely handle bigint over JSON
  claimableXlm: string;
}

export interface BudgetResponse {
  orgId: string;
  budgetStroops: string;
  budgetXlm: string;
}

export interface FundResponse {
  success: boolean;
  transactionHash: string | undefined;
  orgId: string;
  donor: string;
  amountStroops: string;
}

export interface PayoutResponse {
  success: boolean;
  transactionHash: string | undefined;
  orgId: string;
  maintainer: string;
  amountStroops: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const contractController = {
  /**
   * Fetch the details of a registered organization.
   */
  async getOrganization(orgId: string): Promise<OrgResponse> {
    const org = await stellarService.readOrganization(orgId);
    return {
      id: String(org["id"]),
      name: String(org["name"]),
      admin: String(org["admin"]),
    };
  },

  /**
   * Fetch the ordered list of maintainer addresses for an organization.
   */
  async getMaintainers(orgId: string): Promise<MaintainersResponse> {
    const maintainers = await stellarService.readMaintainers(orgId);
    return {
      orgId,
      maintainers,
      count: maintainers.length,
    };
  },

  /**
   * Fetch the current budget for an organization.
   */
  async getOrgBudget(orgId: string): Promise<BudgetResponse> {
    const stroops = await stellarService.readOrgBudget(orgId);
    const xlm = (Number(stroops) / 10_000_000).toFixed(7);
    return {
      orgId,
      budgetStroops: stroops.toString(),
      budgetXlm: xlm,
    };
  },

  /**
   * Fetch the claimable balance for a maintainer address.
   *
   * The balance is denominated in stroops (i128 on-chain). We return it both
   * as a raw string (for precise arithmetic) and as a human-readable XLM value.
   */
  async getClaimableBalance(maintainerAddress: string): Promise<BalanceResponse> {
    const stroops = await stellarService.readClaimableBalance(maintainerAddress);
    const xlm = (Number(stroops) / 10_000_000).toFixed(7);
    return {
      maintainer: maintainerAddress,
      claimableStroops: stroops.toString(),
      claimableXlm: xlm,
    };
  },

  /**
   * Fund an organization's budget.
   */
  async fundOrg(
    orgId: string,
    fromAddress: string,
    amountStroops: string,
    signerSecret: string
  ): Promise<FundResponse> {
    const result = await stellarService.fundOrg(
      orgId,
      fromAddress,
      BigInt(amountStroops),
      signerSecret
    );
    return {
      success: result.success,
      transactionHash: result.transactionHash,
      orgId,
      donor: fromAddress,
      amountStroops,
    };
  },

  /**
   * Allocate a payout to a maintainer.
   *
   * @param orgId           — The org's Symbol ID.
   * @param maintainerAddress — The recipient maintainer's Stellar address.
   * @param amountStroops   — Amount in stroops (as a string to handle large numbers).
   * @param signerSecret    — The org admin's Stellar secret key.
   *
   * ⚠️  Moving the signing to the client side (Freighter) is a planned
   *    enhancement — see feature request template for details.
   */
  async allocatePayout(
    orgId: string,
    maintainerAddress: string,
    amountStroops: string,
    signerSecret: string
  ): Promise<PayoutResponse> {
    const result = await stellarService.allocatePayout(
      orgId,
      maintainerAddress,
      BigInt(amountStroops),
      signerSecret
    );
    return {
      success: result.success,
      transactionHash: result.transactionHash,
      orgId,
      maintainer: maintainerAddress,
      amountStroops,
    };
  },
} as const;
