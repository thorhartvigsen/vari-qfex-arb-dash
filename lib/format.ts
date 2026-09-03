export function formatPrice(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function pointsToBps(
  diff: number | null | undefined,
  mid: number | null | undefined,
): number | null {
  if (
    diff === null ||
    diff === undefined ||
    mid === null ||
    mid === undefined ||
    !Number.isFinite(diff) ||
    !Number.isFinite(mid) ||
    mid <= 0
  ) {
    return null;
  }
  return (diff / mid) * 10_000;
}

export function formatSigned(
  value: number | null | undefined,
  decimals = 2,
  suffix = "",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}${suffix}`;
}

export function formatSpreadBps(value: number | null | undefined): string {
  return formatSigned(value, 2, " bps");
}

export function formatClock(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatAge(ts: number | null | undefined, now = Date.now()): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s ago`;
}

export function parsePrice(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}
