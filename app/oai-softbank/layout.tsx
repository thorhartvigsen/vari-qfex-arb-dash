import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OAI × SoftBank",
  description:
    "Entropy OAI vs QFEX SoftBank (JPY→USD) listing-relative spread around +8 pp",
};

export default function OaiSoftbankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
