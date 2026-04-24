/**
 * @file organizations/page.tsx
 * @description Paginated list of registered organizations.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { RegisterOrgModal } from "@/components/RegisterOrgModal";
import { fetchOrganizations, type Org } from "@/lib/api";

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = async (pageNum: number, append: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchOrganizations(pageNum, 12);
      if (append) {
        setOrgs((prev) => [...prev, ...response.data]);
      } else {
        setOrgs(response.data);
      }
      setTotalPages(response.meta.totalPages);
      setTotalCount(response.meta.totalCount);
      setPage(response.meta.currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrgs(1);
  }, []);

  const handleLoadMore = () => {
    if (page < totalPages) {
      void loadOrgs(page + 1, true);
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
            <Link href="/dashboard" className="text-sm text-white/60 hover:text-white">Dashboard</Link>
            <span className="text-white/20">/</span>
            <h1 className="text-sm font-semibold text-white">Organizations</h1>
          </div>
          <WalletButton />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-bold text-white">All Organizations</h2>
            <p className="mt-2 text-white/50">
              Browse through {totalCount} organizations registered on the PayoutRegistry.
            </p>
          </div>
          <button
            onClick={() => setShowRegisterModal(true)}
            className="rounded-lg bg-gradient-to-r from-stellar-purple to-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stellar-purple/20 transition-all hover:brightness-110"
          >
            + Register Organization
          </button>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard?org=${org.id}`}
              className="glass-card group flex flex-col p-6 transition-all hover:border-stellar-purple/50 hover:bg-white/[0.08]"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stellar-purple/20 text-xl group-hover:bg-stellar-purple/30">
                🏢
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-stellar-purple transition-colors">
                {org.name}
              </h3>
              <p className="mt-1 font-mono text-xs text-white/40">{org.id}</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-stellar-teal" />
                Admin: {org.admin.slice(0, 4)}...{org.admin.slice(-4)}
              </div>
            </Link>
          ))}
        </div>

        {orgs.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-white/40">No organizations found.</p>
          </div>
        )}

        {page < totalPages && (
          <div className="mt-12 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoading}
              className="rounded-full bg-white/[0.06] px-8 py-3 text-sm font-semibold text-white border border-white/[0.1] hover:bg-white/[0.1] transition-all disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Load More"}
            </button>
          </div>
        )}
      </main>

      {showRegisterModal && (
        <RegisterOrgModal
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => {
            setShowRegisterModal(false);
            void loadOrgs(1); // Refresh the first page
          }}
        />
      )}
    </div>
  );
}
