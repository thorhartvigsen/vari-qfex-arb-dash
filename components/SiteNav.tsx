"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Swaps" },
  { href: "/qfex/entropy", label: "QFEX / Entropy" },
  { href: "/oai-softbank", label: "OAI / SoftBank" },
] as const;

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: active ? "var(--arb-light)" : "transparent",
              color: active ? "var(--arb-btn-fg)" : "var(--arb-light)",
              border: active
                ? "1px solid transparent"
                : "1px solid var(--arb-border)",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
