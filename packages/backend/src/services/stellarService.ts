/**
 * @file stellarService.ts
 * @description Core Stellar service layer.
 *
 * This service is the single integration point between the application and the
 * Stellar network. It wraps both:
 *
 *   - `@stellar/stellar-sdk`           — Horizon REST API & Soroban RPC (`SorobanRpc` namespace)
 *
 * All network interaction flows through this class. Controllers should import
 * from this service rather than instantiating SDK objects directly.
 *
 * ## Extending This Service
 *
 * To add a new contract interaction (e.g., a new function you've added to
 * PayoutRegistry):
 *
 *  1. Add a new method below following the pattern of `readClaimableBalance`.
 *  2. Build the `xdr.ScVal` argument list using `nativeToScVal` or the
 *     Soroban SDK helpers.
 *  3. Use `simulateTransaction` for read-only calls and `sendTransaction`
 *     for state-changing calls.
 */

import {
  Horizon,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
  SorobanRpc,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_ID,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  RPC_URL,
} from "../config/env.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccountInfo {
  id: string;
  sequence: string;
  balances: Horizon.HorizonApi.BalanceLine[];
}

export interface ContractCallResult {
  success: boolean;
  value: unknown;
  transactionHash?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class StellarService {
  /** Horizon server instance for REST API calls. */
  private readonly horizon: Horizon.Server;

  /** Soroban RPC server for smart contract interactions. */
  private readonly rpcServer: SorobanRpc.Server;

  constructor() {
    this.horizon = new Horizon.Server(HORIZON_URL, {
      allowHttp: HORIZON_URL.startsWith("http://"), // allow HTTP for local dev only
    });

    this.rpcServer = new SorobanRpc.Server(RPC_URL, {
      allowHttp: RPC_URL.startsWith("http://"),
    });
  }

  // ── Horizon (Account) Operations ─────────────────────────────────────────

  /**
   * Fetch basic account information from Horizon.
   *
   * @param publicKey — The Stellar public key (G...) of the account.
   * @throws If the account does not exist on the network.
   */
  async getAccountInfo(publicKey: string): Promise<AccountInfo> {
    const account = await this.horizon.loadAccount(publicKey);
    return {
      id: account.id,
      sequence: account.sequenceNumber(),
      balances: account.balances,
    };
  }

  // ── Soroban Read Operations ───────────────────────────────────────────────

  /**
   * Read the claimable balance for a maintainer address by simulating a
   * `get_claimable_balance` contract invocation (no transaction fee, read-only).
   *
   * @param maintainerAddress — The Stellar address of the maintainer.
   * @returns The claimable balance in stroops, or `0` if none.
   */
  async readClaimableBalance(maintainerAddress: string): Promise<bigint> {
    const result = await this._simulateContractCall("get_claimable_balance", [
      nativeToScVal(maintainerAddress, { type: "address" }),
    ]);
    return BigInt(scValToNative(result as xdr.ScVal) as number);
  }

  /**
   * Read full information about a registered organization.
   *
   * @param orgId — The Symbol ID of the organization (e.g. "stellar").
   */
  async readOrganization(orgId: string): Promise<Record<string, unknown>> {
    const result = await this._simulateContractCall("get_org", [
      nativeToScVal(orgId, { type: "symbol" }),
    ]);
    // scValToNative converts the contracttype struct to a JS object.
    return scValToNative(result as xdr.ScVal) as Record<string, unknown>;
  }

  /**
   * Read the list of maintainer addresses for an organization.
   *
   * @param orgId — The Symbol ID of the organization.
   * @returns An array of Stellar public key strings.
   */
  async readMaintainers(orgId: string): Promise<string[]> {
    const result = await this._simulateContractCall("get_maintainers", [
      nativeToScVal(orgId, { type: "symbol" }),
    ]);
    return scValToNative(result as xdr.ScVal) as string[];
  }

  /**
   * Read the total budget currently held by an organization.
   *
   * @param orgId — The Symbol ID of the organization.
   */
  async readOrgBudget(orgId: string): Promise<bigint> {
    const result = await this._simulateContractCall("get_org_budget", [
      nativeToScVal(orgId, { type: "symbol" }),
    ]);
    return BigInt(scValToNative(result as xdr.ScVal) as number);
  }

  /**
   * Get all pending payouts for a maintainer across organizations.
   *
   * @param maintainerAddress - Stellar public key
   * @returns Array of pending payouts
   */
  async getMaintainerPayouts(maintainerAddress: string): Promise<Array<{ orgId: string; amount: number }>> {
    try {
      const maintainerResult = await this._simulateContractCall("get_maintainer", [
        nativeToScVal(maintainerAddress, { type: "address" }),
      ]);
      const maintainer = scValToNative(maintainerResult as xdr.ScVal) as { org_id: string };

      const amount = await this.readClaimableBalance(maintainerAddress);

      if (amount > 0n) {
        return [{ orgId: maintainer.org_id, amount: Number(amount) }];
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  // ── Soroban Write Operations ──────────────────────────────────────────────

  /**
   * Initialize the contract with the global Token address.
   */
  async initContract(tokenAddress: string, signerSecret: string): Promise<ContractCallResult> {
    return this._submitContractCall(
      "init",
      [nativeToScVal(tokenAddress, { type: "address" })],
      signerSecret
    );
  }

  /**
   * Register a new organization on the contract.
   * 
   * @param id           — The organization's Symbol ID (max 9 chars).
   * @param name         — The display name of the organization.
   * @param admin        — The admin's Stellar public key.
   * @param signerSecret — The admin's Stellar secret key.
   */
  async registerOrg(
    id: string,
    name: string,
    admin: string,
    signerSecret: string
  ): Promise<ContractCallResult> {
    return this._submitContractCall(
      "register_org",
      [
        nativeToScVal(id, { type: "symbol" }),
        nativeToScVal(name, { type: "string" }),
        nativeToScVal(admin, { type: "address" }),
      ],
      signerSecret
    );
  }

  /**
   * Fund an organization's budget.
   *
   * @param orgId           — The organization's Symbol ID.
   * @param fromAddress     — The funding donor's Stellar address.
   * @param amountStroops   — Amount in stroops to donate.
   * @param signerSecret    — The donor's Stellar secret key.
   */
  async fundOrg(
    orgId: string,
    fromAddress: string,
    amountStroops: bigint,
    signerSecret: string
  ): Promise<ContractCallResult> {
    return this._submitContractCall(
      "fund_org",
      [
        nativeToScVal(orgId, { type: "symbol" }),
        nativeToScVal(fromAddress, { type: "address" }),
        nativeToScVal(amountStroops, { type: "i128" }),
      ],
      signerSecret
    );
  }

  /**
   * Allocate a payout to a maintainer by building and submitting a Soroban
   * transaction signed by the org admin.
   *
   * ⚠️  Security note: In this scaffold the `signerSecret` is passed directly.
   * In a production system, signing should happen client-side (via Freighter)
   * and only the signed XDR should reach this endpoint.
   *
   * @param orgId           — The organization's Symbol ID.
   * @param maintainerAddress — The maintainer's Stellar address.
   * @param amountStroops   — Amount in stroops (bigint).
   * @param signerSecret    — The admin's Stellar secret key (S...).
   * @param unlockTimestamp — Optional unlock timestamp.
   */
  async allocatePayout(
    orgId: string,
    maintainerAddress: string,
    amountStroops: bigint,
    signerSecret: string,
    unlockTimestamp: number = 0
  ): Promise<ContractCallResult> {
    return this._submitContractCall(
      "allocate_payout",
      [
        nativeToScVal(orgId, { type: "symbol" }),
        nativeToScVal(maintainerAddress, { type: "address" }),
        nativeToScVal(amountStroops, { type: "i128" }),
        nativeToScVal(unlockTimestamp, { type: "u64" }),
      ],
      signerSecret
    );
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  /**
   * Simulate a read-only contract call via Soroban RPC `simulateTransaction`.
   * Simulation does not consume fees and is suitable for view functions.
   */
  private async _simulateContractCall(
    functionName: string,
    args: xdr.ScVal[]
  ): Promise<xdr.ScVal> {
    // We need a temporary account for the simulation envelope.
    // Using a well-known Testnet account placeholder is fine for simulation.
    const sourceKeypair = Keypair.random();
    const account = await this.horizon
      .loadAccount(sourceKeypair.publicKey())
      .catch(() => {
        // Fall back to a dummy account for pure simulation.
        return {
          id: sourceKeypair.publicKey(),
          sequenceNumber: () => "0",
        } as unknown as Horizon.AccountResponse;
      });

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        // @ts-expect-error — invokeContractFunction exists at runtime but is missing from SDK types
        xdr.Operation.invokeContractFunction({
          contractAddress: xdr.ScAddress.scAddressTypeContract(
            xdr.Hash.fromXDR(CONTRACT_ID, "hex")
          ),
          functionName,
          args,
        })
      )
      .setTimeout(30)
      .build();

    const simResult = await this.rpcServer.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // result.retval is present on successful simulations (not reflected in SDK typings)
    return (simResult.result as { retval: xdr.ScVal } | undefined)?.retval as xdr.ScVal;
  }

  /**
   * Submit a state-changing contract call.
   * Builds → Simulates (to get auth + footprint) → Signs → Sends.
   */
  private async _submitContractCall(
    functionName: string,
    args: xdr.ScVal[],
    signerSecret: string
  ): Promise<ContractCallResult> {
    const keypair = Keypair.fromSecret(signerSecret);
    const account = await this.horizon.loadAccount(keypair.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (xdr.Operation as any).invokeContractFunction({
          contractAddress: xdr.ScAddress.scAddressTypeContract(
            xdr.Hash.fromXDR(CONTRACT_ID, "hex")
          ),
          functionName,
          args,
        })
      )
      .setTimeout(30)
      .build();

    // Simulate to get the authorisation + storage footprint.
    const simResult = await this.rpcServer.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // Assemble the fully-prepared (authorised + footprint-extended) transaction.
    const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(keypair);

    const sendResult = await this.rpcServer.sendTransaction(preparedTx);

    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${JSON.stringify(sendResult)}`);
    }

    // Poll for confirmation.
    let getResult = await this.rpcServer.getTransaction(sendResult.hash);
    while (getResult.status === "NOT_FOUND") {
      await new Promise((r) => setTimeout(r, 1000));
      getResult = await this.rpcServer.getTransaction(sendResult.hash);
    }

    if (getResult.status !== "SUCCESS") {
      throw new Error(`Transaction not successful: ${getResult.status}`);
    }

    return {
      success: true,
      value: scValToNative(getResult.returnValue as xdr.ScVal),
      transactionHash: sendResult.hash,
    };
  }
}

// Singleton export — avoids creating multiple SDK client instances.
export const stellarService = new StellarService();
