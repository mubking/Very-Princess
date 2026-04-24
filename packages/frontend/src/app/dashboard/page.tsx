/**
 * @file dashboard/page.tsx
 * @description PayoutRegistry dashboard.
 */

"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { PayoutCard } from "@/components/PayoutCard";
import { FundOrgModal } from "@/components/FundOrgModal";
import { useFreighter } from "@/hooks/useFreighter";
import { 
  readOrganization, 
  readMaintainers, 
  readClaimableBalance, 
  readOrgBudget, 
  buildClaimPayoutTransaction, 
  submitSignedTransaction 
} from "@/lib/sorobanClient";
import type { Organization, MaintainerBalance } from "@/lib/contractTypes";

// ── Dashboard Component ───────────────────────────────────────────────────────

function DashboardContent() {
  const { isConnected, publicKey, isInitialized, signTransaction } = useFreighter();
  const searchParams = useSearchParams();

  // ── State ─────────────────────────────────────────────────────────────────
  const [orgIdInput, setOrgIdInput] = useState("");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgBudget, setOrgBudget] = useState<{ stroops: bigint; xlm: string } | null>(null);
  const [showFundModal, setShowFundModal] = useState(false);
  const [claimingAddress, setClaimingAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<MaintainerBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Fetch org data, budget, and all maintainer balances from Soroban RPC. */
  const handleLookupOrg = async (id?: string) => {
    const targetId = id || orgIdInput.trim();
    if (!targetId) return;
    
    setIsLoading(true);
    setError(null);
    setOrganization(null);
    setBalances([]);
    setOrgBudget(null);

    try {
      // Parallel: read org info, budget, and maintainer list simultaneously.
      const [org, budget, maintainerAddresses] = await Promise.all([
        readOrganization(targetId),
        readOrgBudget(targetId),
        readMaintainers(targetId),
      ]);
      setOrganization(org);
      setOrgBudget(budget);

      // Fetch each maintainer's balance (parallel).
      const balanceResults = await Promise.all(
        maintainerAddresses.map((addr) => readClaimableBalance(addr))
      );
      setBalances(balanceResults);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-lookup if org ID is in search params
  useEffect(() => {
    const orgId = searchParams.get("org");
    if (orgId) {
      setOrgIdInput(orgId);
      void handleLookupOrg(orgId);
    }
  }, [searchParams]);

  /** Prepare, sign, and submit the claim_payout transaction. */
  const handleClaim = async (address: string) => {
    if (!isConnected || !publicKey) return;
    setClaimingAddress(address);
    try {
      const unsignedXdr = await buildClaimPayoutTransaction(address);
      const signedXdr = await signTransaction(unsignedXdr);
      await submitSignedTransaction(signedXdr);
      
      // Refresh the balances after claim is confirmed
      void handleLookupOrg();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaimingAddress(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-stellar-blue/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-white/60 transition-colors hover:text-white">
              <span className="text-sm font-bold">VP</span>
            </Link>
            <span className="text-white/20">/</span>
            <h1 className="text-sm font-semibold text-white">Dashboard</h1>
          </div>
          <WalletButton />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {/* ── Wallet Guard ─────────────────────────────────────────────── */}
        {isInitialized && !isConnected ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-stellar-purple/30 bg-stellar-purple/10">
              <LockIcon />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white">Connect Your Wallet</h2>
            <p className="mb-8 max-w-sm text-sm text-white/50">
              Connect your Freighter wallet to interact with the PayoutRegistry
              on Stellar Testnet.
            </p>
            <WalletButton />
          </div>
        ) : (
          <>
            {/* ── Connected State ─────────────────────────────────────── */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">PayoutRegistry</h2>
                <p className="mt-1 text-sm text-white/50">
                  Look up an organization to view maintainer balances.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/organizations" className="text-sm text-stellar-teal hover:underline transition-all">
                  Browse Organizations →
                </Link>
                {publicKey && (
                  <div className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 sm:flex">
                    <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.4)]" />
                    <span className="font-mono text-xs text-white/60">
                      {publicKey.slice(0, 6)}...{publicKey.slice(-6)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Org Lookup Form ─────────────────────────────────────── */}
            <div className="glass-card mb-8 p-6">
              <label
                htmlFor="org-id-input"
                className="mb-2 block text-sm font-medium text-white/70"
              >
                Organization ID
              </label>
              <div className="flex gap-3">
                <input
                  id="org-id-input"
                  type="text"
                  value={orgIdInput}
                  onChange={(e) => setOrgIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleLookupOrg()}
                  placeholder="e.g. stellar (max 9 chars)"
                  maxLength={9}
                  className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 font-mono text-sm text-white placeholder-white/30 outline-none transition-all focus:border-stellar-purple/60 focus:bg-white/[0.08] focus:ring-1 focus:ring-stellar-purple/30"
                />
                <button
                  onClick={() => void handleLookupOrg()}
                  disabled={isLoading || !orgIdInput.trim()}
                  className="rounded-lg bg-gradient-to-r from-stellar-purple to-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stellar-purple/20 transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? "Loading..." : "Lookup"}
                </button>
              </div>
            </div>

            {/* ── Error ───────────────────────────────────────────────── */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* ── Org Info ─────────────────────────────────────────────── */}
            {organization && (
              <div className="glass-card mb-8 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-stellar-purple to-stellar-teal font-bold text-white">
                    {organization.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{organization.name}</h3>
                    <p className="font-mono text-xs text-white/40">ID: {organization.id}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3">
                  <p className="text-xs font-medium text-white/40">Admin Address</p>
                  <p className="mt-1 break-all font-mono text-sm text-white/70">
                    {organization.admin}
                  </p>
                </div>

                {orgBudget && (
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-stellar-teal/20 bg-stellar-teal/5 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase text-stellar-teal/80">Available Budget</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{orgBudget.xlm}</span>
                        <span className="text-sm font-medium text-stellar-teal">XLM</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowFundModal(true)}
                      className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stellar-teal transition-all"
                    >
                      Fund Org
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Balances Grid ── */}
            {organization && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {balances.map((balance) => (
                  <PayoutCard
                    key={balance.maintainer}
                    balance={balance}
                    isClaiming={claimingAddress === balance.maintainer}
                    onClaim={() => handleClaim(balance.maintainer)}
                    canClaim={publicKey === balance.maintainer}
                  />
                ))}
              </div>
            )}

            {organization && balances.length === 0 && !isLoading && (
              <div className="py-20 text-center">
                <p className="text-white/40">No maintainers found.</p>
              </div>
            )}
          </>
        )}
      </main>

      {showFundModal && organization && (
        <FundOrgModal
          orgId={organization.id}
          orgName={organization.name}
          onClose={() => setShowFundModal(false)}
          onSuccess={() => {
            setShowFundModal(false);
            void handleLookupOrg();
          }}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-stellar-blue">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stellar-purple border-t-transparent" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function LockIcon() {
  return (
    <svg className="h-8 w-8 text-stellar-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
