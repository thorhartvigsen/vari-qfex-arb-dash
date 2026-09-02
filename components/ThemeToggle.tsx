"use client";

import { useEffect, useState } from "react";

type ThemeMode = "night" | "day";

const STORAGE_KEY = "arb-theme";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("night");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next: ThemeMode = saved === "day" ? "day" : "night";
    setMode(next);
    applyTheme(next);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "night" ? "day" : "night";
    setMode(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const isDay = mode === "day";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDay ? "Switch to night mode" : "Switch to day mode"}
      title={isDay ? "Night mode" : "Day mode"}
      className="flex h-10 w-10 items-center justify-center rounded-md transition"
      style={{
        border: "1px solid var(--arb-border)",
        backgroundColor: "var(--arb-panel)",
        color: "var(--arb-light)",
      }}
    >
      {isDay ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12.5 2.1a9.9 9.9 0 1 0 9.4 13.3A8.2 8.2 0 0 1 12.5 2.1z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
