import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QFEX × Entropy",
  description: "NBIS and SNDK arb: QFEX vs Hyperliquid io",
};

export default function EntropyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
