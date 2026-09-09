export const QFEX_MDS = "wss://mds.qfex.com";
export const VARIATIONAL_STATS_URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

export const THEME = {
  bg: "#324c39",
  bgPanel: "#3a5642",
  bgPanelSoft: "#3f5c47",
  light: "var(--arb-light)",
  muted: "var(--arb-text)",
  border: "var(--arb-border)",
  qfex: "var(--arb-qfex)",
  variational: "var(--arb-xyz)",
  accent: "#e8e4d4",
  positive: "var(--arb-positive)",
  negative: "var(--arb-negative)",
  grid: "var(--arb-grid)",
} as const;

export const PAIR_IDS = ["gold", "silver", "us100", "us500"] as const;
export type PairId = (typeof PAIR_IDS)[number];

export type Side = "long" | "short";

export interface Bbo {
  bid: number | null;
  ask: number | null;
  mark?: number | null;
  updatedAt?: number | null;
}

export interface PairConfig {
  id: PairId;
  label: string;
  title: string;
  varTicker: string;
  varName: string;
  qfexSymbol: string;
  qfexLabel: string;
  priceDecimals: number;
}

export const PAIRS: Record<PairId, PairConfig> = {
  gold: {
    id: "gold",
    label: "Gold",
    title: "Gold — XAUS vs GOLD-USD",
    varTicker: "XAUS",
    varName: "Variational XAUS",
    qfexSymbol: "GOLD-USD",
    qfexLabel: "QFEX GOLD-USD",
    priceDecimals: 2,
  },
  silver: {
    id: "silver",
    label: "Silver",
    title: "Silver — XAGS vs SILVER-USD",
    varTicker: "XAGS",
    varName: "Variational XAGS",
    qfexSymbol: "SILVER-USD",
    qfexLabel: "QFEX SILVER-USD",
    priceDecimals: 3,
  },
  us100: {
    id: "us100",
    label: "US100",
    title: "US100 — US100S vs US100-USD",
    varTicker: "US100S",
    varName: "Variational US100S",
    qfexSymbol: "US100-USD",
    qfexLabel: "QFEX US100-USD",
    priceDecimals: 2,
  },
  us500: {
    id: "us500",
    label: "US500",
    title: "US500 — US500S vs US500-USD",
    varTicker: "US500S",
    varName: "Variational US500S",
    qfexSymbol: "US500-USD",
    qfexLabel: "QFEX US500-USD",
    priceDecimals: 2,
  },
};

export interface PairPosition {
  varSide: Side;
  qfexSide: Side;
  varEntry: string;
  qfexEntry: string;
}

export const DEFAULT_POSITION: PairPosition = {
  varSide: "short",
  qfexSide: "long",
  varEntry: "",
  qfexEntry: "",
};

export interface BookLevel {
  price: number;
  size: number;
}
