/**
 * @file useFreighter.ts
 * @description React hook for Freighter wallet integration.
 *
 * Freighter is the standard browser extension wallet for the Stellar network.
 * This hook abstracts all wallet interactions so that components can simply
 * consume `{ isConnected, publicKey, connect, signTransaction }` without
 * dealing directly with the `@stellar/freighter-api` package.
 *
 * ## Usage
 *
 * ```tsx
 * const { isConnected, publicKey, connect, isLoading } = useFreighter();
 *
 * if (!isConnected) {
 *   return <button onClick={connect}>Connect Freighter</button>;
 * }
 * return <p>Hello, {publicKey}</p>;
 * ```
 *
 * ## Extending
 *
 * To sign a transaction and submit it:
 * ```tsx
 * const { signTransaction } = useFreighter();
 * const signedXdr = await signTransaction(unsignedXdr, { network: "TESTNET" });
 * ```
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isConnected as freighterIsConnected,
  getPublicKey,
  signTransaction as freighterSignTransaction,
  isAllowed,
  setAllowed,
} from "@stellar/freighter-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FreighterState {
  /** True once the browser extension has been detected and queried. */
  isInitialized: boolean;
  /** True if Freighter extension is installed in the browser. */
  isInstalled: boolean;
  /** True if the user has connected their wallet to this page. */
  isConnected: boolean;
  /** The connected Stellar public key (G...), or null if not connected. */
  publicKey: string | null;
  /** True while a connection request or sign request is in flight. */
  isLoading: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Initiate a wallet connection request. */
  connect: () => Promise<void>;
  /** Disconnect (clear local state — Freighter has no programmatic logout). */
  disconnect: () => void;
  /**
   * Request Freighter to sign a transaction XDR.
   *
   * @param transactionXdr — Base64-encoded unsigned transaction XDR.
   * @returns Base64-encoded signed transaction XDR.
   */
  signTransaction: (transactionXdr: string) => Promise<string>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current Freighter wallet state and interaction callbacks.
 */
export function useFreighter(): FreighterState {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Detect Freighter on mount ─────────────────────────────────────────────

  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const connected = await freighterIsConnected();
        setIsInstalled(connected !== undefined);

        if (connected) {
          // Check if this site is already allowed without another prompt.
          const allowed = await isAllowed();
          if (allowed) {
            const pk = await getPublicKey();
            setPublicKey(pk ?? null);
            setIsConnected(!!pk);
          }
        }
      } catch {
        // Freighter not installed — stay in unconnected state.
        setIsInstalled(false);
      } finally {
        setIsInitialized(true);
      }
    };

    void checkFreighter();
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isInstalled) {
        throw new Error(
          "Freighter is not installed. Get it at freighter.app"
        );
      }

      // Grant this site permission to read the public key.
      await setAllowed();

      const pk = await getPublicKey();

      if (!pk) {
        throw new Error("Failed to retrieve public key from Freighter.");
      }

      setPublicKey(pk);
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setIsConnected(false);
      setPublicKey(null);
    } finally {
      setIsLoading(false);
    }
  }, [isInstalled]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    // Freighter does not expose a programmatic revoke API yet.
    // We clear local state — the user can manually disconnect in the extension.
    setIsConnected(false);
    setPublicKey(null);
    setError(null);
  }, []);

  // ── Sign Transaction ──────────────────────────────────────────────────────

  const signTransaction = useCallback(
    async (transactionXdr: string): Promise<string> => {
      if (!isConnected || !publicKey) {
        throw new Error("Wallet is not connected. Call connect() first.");
      }

      setIsLoading(true);
      setError(null);

      try {
        const signedTxXdr = await freighterSignTransaction(transactionXdr, {
            network: "TESTNET",
            networkPassphrase:
              process.env["NEXT_PUBLIC_NETWORK_PASSPHRASE"] ??
              "Test SDF Network ; September 2015",
          });

        if (!signedTxXdr) {
          throw new Error("Signing was rejected or failed.");
        }

        return signedTxXdr;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, publicKey]
  );

  return {
    isInitialized,
    isInstalled,
    isConnected,
    publicKey,
    isLoading,
    error,
    connect,
    disconnect,
    signTransaction,
  };
}
