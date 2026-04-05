/**
 * @file layout.tsx
 * @description Root layout for the very-princess Next.js application.
 *
 * This layout wraps every page with:
 *  - Google Fonts (Inter + JetBrains Mono)
 *  - Global Tailwind base styles
 *  - A consistent dark-space background
 *  - SEO meta tags
 */

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// ── Font Loading ──────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// ── SEO Metadata ──────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    template: "%s | very-princess",
    default: "very-princess — Stellar Payout Registry",
  },
  description:
    "A decentralised multi-organization maintenance payout registry built on Stellar Soroban. Transparently track and claim contributor payouts on-chain.",
  keywords: ["Stellar", "Soroban", "DeFi", "Open Source", "Drips", "Payouts"],
  openGraph: {
    siteName: "very-princess",
    type: "website",
  },
};

// ── Layout ────────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-stellar-blue font-sans text-white antialiased">
        {/* Starfield ambient background */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 bg-hero-pattern"
        />
        {/* Page content */}
        <div className="relative">{children}</div>
      </body>
    </html>
  );
}
