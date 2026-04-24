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

type Props = {
  params: { id: string };
};

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
    default: "very-princess – Stellar Payout Registry",
  },
  description:
    "A decentralised multi-organization maintenance payout registry built on Stellar Soroban. Transparently track and claim contributor payouts on-chain.",
  keywords: ["Stellar", "Soroban", "DeFi", "Open Source", "Drips", "Payouts"],
  openGraph: {
    siteName: "very-princess",
    type: "website",
    title: "very-princess – Stellar Payout Registry",
    description:
      "Transparently track and claim contributor payouts on-chain via Stellar Soroban.",
    url: "https://very-princess.xyz",
  },
  twitter: {
    card: "summary_large_image",
    title: "very-princess – Stellar Payout Registry",
    description:
      "Transparently track and claim contributor payouts on-chain via Stellar Soroban.",
  },
};

// ── Layout ────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  openGraph: {
    title: "very-princess – Organization Dashboard",
    description: "View organization details and claim contributor payouts on-chain.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "very-princess – Organization Dashboard",
    description: "View organization details and claim contributor payouts on-chain.",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // replace with your actual data fetching
  const org = await fetchOrg(params.id);

  return {
    title: org.name,
    description: `${org.name} — Budget: ${org.budget}`,
    openGraph: {
      title: org.name,
      description: `${org.name} — Budget: ${org.budget}`,
    },
    twitter: {
      card: "summary",
      title: org.name,
      description: `${org.name} — Budget: ${org.budget}`,
    },
  };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

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
