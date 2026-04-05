/**
 * @file sorobanClient.ts
 * @description Browser-side Soroban RPC client for reading PayoutRegistry state.
 *
 * This module provides read-only contract interaction utilities for the Next.js
 * frontend. It uses `simulateTransaction` (no fees, no signing required) to
 * fetch on-chain state.
 *
 * Write operations (allocate/claim) are routed through the backend API to avoid
 * exposing secret keys in the browser. Freighter is used for transaction signing
 * via the `useFreighter` hook.
 *
 * ## Adding New Read Operations
 *
 * 1. Identify the contract function name (e.g. `get_org`).
 * 2. Build the argument list using `nativeToScVal`.
 * 3. Call `simulateContractCall(functionName, args)` and convert the return
 *    value with `scValToNative`.
 */

"use client";

import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Contract,
  Keypair,
  Horizon,
} from "@stellar/stellar-sdk";
import type { MaintainerBalance, Organization } from "./contractTypes";

// ─── Network Configuration ────────────────────────────────────────────────────

const HORIZON_URL = process.env["NEXT_PUBLIC_HORIZON_URL"] ?? "https://horizon-testnet.stellar.org";
const RPC_URL =
  process.env["NEXT_PUBLIC_RPC_URL"] ?? "https://soroban-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  process.env["NEXT_PUBLIC_NETWORK_PASSPHRASE"] ??
  Networks.TESTNET;

const CONTRACT_ID = process.env["NEXT_PUBLIC_CONTRACT_ID"] ?? "";

// ─── RPC Server Singleton ─────────────────────────────────────────────────────

/**
 * Soroban RPC server instance.
 * Instantiated once and reused across all calls to avoid unnecessary overhead.
 */
const rpcServer = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const horizonServer = new Horizon.Server(HORIZON_URL, { allowHttp: false });

// ─── Simulation Helper ────────────────────────────────────────────────────────

/**
 * Simulate a read-only contract call and return the raw ScVal result.
 *
 * We use a randomly-generated throwaway keypair as the "source" of the
 * simulation envelope. Simulation does not submit a real transaction, so
 * the source account doesn't need to exist or be funded.
 */
async function simulateContractCall(
  functionName: string,
  args: Parameters<typeof nativeToScVal>[0][]
): Promise<ReturnType<typeof scValToNative>> {
  if (!CONTRACT_ID) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ID is not set. Deploy the contract first."
    );
  }

  // Throwaway source for simulation envelope only.
  const fakeKeypair = Keypair.random();
  const contract = new Contract(CONTRACT_ID);

  // Provide a minimal account object for TransactionBuilder.
  const fakeAccount = {
    accountId: () => fakeKeypair.publicKey(),
    sequenceNumber: () => "0",
    incrementSequenceNumber: () => {},
  };

  const tx = new TransactionBuilder(
    // @ts-ignore — minimal account duck-typing is sufficient for simulation
    fakeAccount,
    { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }
  )
    .addOperation(
      // @ts-ignore — call() accepts string args
      contract.call(functionName, ...args.map((a) => nativeToScVal(a)))
    )
    .setTimeout(30)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Contract simulation failed: ${simResult.error}`);
  }

  // @ts-ignore — returnVal present on success result
  return scValToNative(simResult.result?.retval);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read a registered organization from the PayoutRegistry.
 *
 * @param orgId — Short Symbol ID of the organization (max 9 chars).
 */
export async function readOrganization(orgId: string): Promise<Organization> {
  const raw = await simulateContractCall("get_org", [orgId]);
  const map = raw as Record<string, unknown>;
  return {
    id: String(map["id"]),
    name: String(map["name"]),
    admin: String(map["admin"]),
  };
}

/**
 * Read the list of maintainer addresses for an organization.
 *
 * @param orgId — Short Symbol ID of the organization.
 * @returns Array of Stellar public key strings.
 */
export async function readMaintainers(orgId: string): Promise<string[]> {
  const raw = await simulateContractCall("get_maintainers", [orgId]);
  return Array.isArray(raw) ? (raw as string[]) : [];
}

/**
 * Read the claimable balance for a maintainer address.
 *
 * @param address — Stellar public key (G...) of the maintainer.
 */
export async function readClaimableBalance(
  address: string
): Promise<MaintainerBalance> {
  const raw = await simulateContractCall("get_claimable_balance", [address]);
  const stroops = BigInt(raw as number);
  const xlm = (Number(stroops) / 10_000_000).toFixed(7);
  return { address, stroops, xlm };
}

/**
 * Read the total budget for an organization.
 * @param orgId - Symbol ID of the organization.
 */
export async function readOrgBudget(orgId: string): Promise<Pick<MaintainerBalance, "stroops" | "xlm">> {
  const raw = await simulateContractCall("get_org_budget", [orgId]);
  const stroops = BigInt(raw as number);
  const xlm = (Number(stroops) / 10_000_000).toFixed(7);
  return { stroops, xlm };
}

/**
 * Read the native XLM balance for a connected wallet address via Horizon.
 *
 * Returns `null` when the account doesn't exist on the network (i.e. it has
 * never been funded — Horizon returns 404 for unfunded addresses).
 *
 * @param address — Stellar public key (G...).
 * @returns XLM balance as a number, or null if unfunded / not found.
 */
export async function readAccountXlmBalance(address: string): Promise<number | null> {
  try {
    const account = await horizonServer.loadAccount(address);
    const nativeLine = account.balances.find(
      (b): b is typeof b & { asset_type: "native" } => b.asset_type === "native"
    );
    return nativeLine ? parseFloat(nativeLine.balance) : 0;
  } catch {
    // Horizon returns 404 for accounts that have never been funded.
    // This is expected for brand-new testnet wallets.
    return null;
  }
}

// ─── Write API (Transaction Builders) ──────────────────────────────────────────

/**
 * Helper to fetch a real account from Horizon to build a transaction.
 */
async function loadAccount(publicKey: string) {
  try {
    return await horizonServer.loadAccount(publicKey);
  } catch (err) {
    throw new Error(`Failed to load account from network. Ensure ${publicKey} is funded on Testnet.`);
  }
}

/**
 * Build, simulate, and prepare an unsigned XDR for `fund_org`.
 *
 * @param orgId — Organization ID.
 * @param fromAddress — The user's public key connected via Freighter.
 * @param amountStroops — Amount to fund in stroops.
 * @returns Base64 encoded unsigned transaction XDR string.
 */
export async function buildFundOrgTransaction(
  orgId: string,
  fromAddress: string,
  amountStroops: bigint
): Promise<string> {
  const account = await loadAccount(fromAddress);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      // @ts-ignore
      contract.call("fund_org",
        nativeToScVal(orgId),
        nativeToScVal(fromAddress),
        nativeToScVal(amountStroops, { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Combine auth footprint into final unsigned transaction
  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  return preparedTx.toXDR();
}

/**
 * Build, simulate, and prepare an unsigned XDR for `claim_payout`.
 *
 * @param userAddress — The maintainer's public key.
 * @returns Base64 encoded unsigned transaction XDR string.
 */
export async function buildClaimPayoutTransaction(userAddress: string): Promise<string> {
  const account = await loadAccount(userAddress);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      // @ts-ignore
      contract.call("claim_payout",
        nativeToScVal(userAddress)
      )
    )
    .setTimeout(60)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  return preparedTx.toXDR();
}

/**
 * Submit a signed transaction to Soroban RPC and wait for confirmation.
 * @param signedXdr — Base64 string from Freighter.
 */
export async function submitSignedTransaction(signedXdr: string): Promise<unknown> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  
  // Submit the transaction
  const sendResult = await rpcServer.sendTransaction(tx as any);
  if (sendResult.status === "ERROR") {
    throw new Error(`Send error: ${JSON.stringify(sendResult)}`);
  }

  // Poll for completion
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        return reject(new Error("Transaction confirmation timed out."));
      }

      try {
        const getTxResponse = await rpcServer.getTransaction(sendResult.hash);
        if (getTxResponse.status === "SUCCESS") {
          clearInterval(interval);
          resolve(scValToNative(getTxResponse.returnValue as any));
        } else if (getTxResponse.status === "FAILED") {
          clearInterval(interval);
          reject(new Error(`Transaction failed on ledger`));
        }
        // NOT_FOUND means we keep waiting
      } catch (err) {
        // network issue, keep polling
      }
    }, 2000);
  });
}
