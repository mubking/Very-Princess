/**
 * @file page.tsx
 * @description Landing page for very-princess.
 *
 * The homepage is a marketing/onboarding page that:
 *  1. Explains the project purpose to first-time visitors.
 *  2. Shows the wallet connect CTA.
 *  3. Directs connected users to the /dashboard.
 *
 * This is a Server Component by default (no "use client" directive).
 * The WalletButton is a Client Component imported here.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";

export const metadata: Metadata = {
  title: "very-princess — Stellar Payout Registry",
  description:
    "A decentralised payout registry for open-source maintainers, built on Stellar Soroban. Connect your Freighter wallet to view and claim your payouts.",
};

// ── Feature Cards Data ────────────────────────────────────────────────────────

const features = [
  {
    icon: "🏛️",
    title: "On-chain Registry",
    description:
      "Organizations and maintainers are registered directly on Stellar Soroban — transparent and tamper-proof.",
  },
  {
    icon: "⚡",
    title: "Instant Payouts",
    description:
      "Org admins allocate payouts on-chain. Maintainers claim their accumulated balance in a single transaction.",
  },
  {
    icon: "🔓",
    title: "Self-custodial",
    description:
      "No intermediary holds your funds. Claim directly to your Freighter wallet — your keys, your XLM.",
  },
  {
    icon: "🌐",
    title: "Open Source",
    description:
      "Built for the Drips community funding model. Fork it, extend it, contribute. See CONTRIBUTING.md.",
  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-stellar-blue/80 backdrop-blur-xl">
        <nav
          className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"
          aria-label="Main navigation"
        >
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-stellar-purple to-stellar-teal shadow-lg shadow-stellar-purple/30">
              <span className="text-sm font-bold text-white">VP</span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">
              very-princess
            </span>
            {/* Network badge */}
            <span className="badge border border-stellar-teal/30 bg-stellar-teal/10 text-stellar-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-stellar-teal" />
              Testnet
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              Dashboard
            </Link>
            <WalletButton />
          </div>
        </nav>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div className="animate-fade-in">
          {/* Pre-headline badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stellar-purple/30 bg-stellar-purple/10 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-stellar-purple shadow-[0_0_8px_2px_rgba(123,97,255,0.6)]" />
            <span className="text-sm font-medium text-stellar-purple">
              Built on Stellar Soroban · Drips Wave 4
            </span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            Open Source
            <br />
            <span className="gradient-text">Payout Registry</span>
          </h1>

          {/* Sub-headline */}
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
            A transparent, on-chain system for multi-organization maintenance
            payouts. Organizations register, allocate, and maintainers
            self-custody their contributions — all on Stellar.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              id="go-to-dashboard-btn"
              className="rounded-lg bg-gradient-to-r from-stellar-purple to-brand-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-stellar-purple/30 transition-all duration-200 hover:brightness-110 hover:shadow-stellar-purple/50"
            >
              Open Dashboard →
            </Link>
            <a
              href="https://github.com/very-princess"
              target="_blank"
              rel="noopener noreferrer"
              id="view-github-btn"
              className="rounded-lg border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white/80 transition-all duration-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* ── Feature Grid ────────────────────────────────────────────────── */}
        <div className="mt-24 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-card p-6 text-left transition-all duration-300 hover:border-stellar-purple/20"
            >
              <div className="mb-3 text-2xl">{feature.icon}</div>
              <h3 className="mb-2 text-sm font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/50">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-8 text-center">
        <p className="text-xs text-white/30">
          very-princess is open source — MIT Licensed ·{" "}
          <a
            href="https://stellar.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Stellar Network
          </a>{" "}
          ·{" "}
          <a
            href="https://drips.network"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Drips
          </a>
        </p>
      </footer>
    </div>
  );
}
